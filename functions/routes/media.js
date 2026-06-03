const express = require("express");
const multer = require("multer");
const { z } = require("zod");

const middlewares = require("../middlewares");
const {
  logger,
  uploadImage,
  uploadGeneralFile,
  deleteImage,
  deleteCloudinaryAsset,
  generateToken,
  stripMongoId,
  serverError,
  clientError,
} = require("../helpers");
const db = require("../db");
const services = require("../services");
const { mediaFileSchema } = require("../models/media-file");

const router = express.Router();
const { media: mediaRateLimiter } = middlewares.rateLimiters;

/**
 * @swagger
 * tags:
 * name: Media
 * description: Media image and file upload API
 */

const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"), false);
  },
  storage: multer.memoryStorage(),
});

const fileUpload = multer({
  limits: { fileSize: 25 * 1024 * 1024 },
  storage: multer.memoryStorage(),
});

const uploadMiddlewareHandler = upload.single("image");
const uploadMiddleware = (req, res, next) => {
  uploadMiddlewareHandler(req, res, (err) => {
    if (!err) return next();
    return res.status(400).json({
      success: false,
      message: "Media upload error",
      data: { error: err.message },
    });
  });
};

const fileUploadMiddlewareHandler = fileUpload.single("file");
const fileUploadMiddleware = (req, res, next) => {
  fileUploadMiddlewareHandler(req, res, (err) => {
    if (!err) return next();
    return res.status(400).json({
      success: false,
      message: "File upload error",
      data: { error: err.message },
    });
  });
};

const listFilesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(100),
  type: z.union([z.enum(["image", "document", "video", "other"]), z.literal("")]).optional().default(""),
  uploadedBy: z.string().optional().default(""),
});

const registerFileUrlSchema = z.object({
  url: z.string().url().refine((value) => value.startsWith("https://"), "URL must use HTTPS"),
  fileName: z.string().min(1).optional(),
  type: z.enum(["image", "document", "video", "other"]).optional().default("other"),
  mimeType: z.string().min(1).optional().default("application/octet-stream"),
  sizeBytes: z.coerce.number().int().nonnegative().optional().default(0),
});

function inferMediaType(mimeType = "") {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (
    mimeType === "application/pdf" ||
    mimeType.includes("document") ||
    mimeType.includes("word") ||
    mimeType.includes("excel") ||
    mimeType.includes("powerpoint") ||
    mimeType.startsWith("text/")
  ) return "document";
  return "other";
}

function publicMediaFile(file) {
  return stripMongoId(file);
}

function resolveCloudinaryResourceType(file) {
  if (file?.resourceType) return file.resourceType;
  if (file?.type === "image") return "image";
  if (file?.type === "video") return "video";
  return "raw";
}

function buildMediaFileRecord({ id, fileName, type, mimeType, sizeBytes, storageProvider, publicId = null, resourceType = null, url, uploadedBy }) {
  const now = Date.now();
  return {
    id,
    fileName,
    type,
    mimeType,
    sizeBytes,
    storageProvider,
    publicId,
    resourceType,
    url,
    uploadedBy,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * @swagger
 * /api/media/images/all:
 * get:
 * summary: Retrieve all uploaded images
 * tags: [Media]
 * responses:
 * 200:
 * description: A list of image objects
 */
router.get("/images/all", mediaRateLimiter, async (req, res) => {
  try {
    const images = await db.getImages();
    res.status(200).json({
      success: true,
      message: "Fetch media success",
      data: {
        images: images.map(({ id, url }) => ({
          id,
          url: url || `${process.env.SERVER_BASE_URL}/api/media/images/${id}`,
        })),
      },
    });
  } catch (e) {
    logger("ALL_MEDIA_IMAGES").error(e);
    return serverError(res, e, "Failed to fetch images.");
  }
});

/**
 * @swagger
 * /api/media/files:
 * get:
 * summary: Retrieve uploaded and registered media files
 * tags: [Media]
 */
router.get("/files", mediaRateLimiter, async (req, res) => {
  try {
    const parsed = listFilesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return clientError(res, 400, "Invalid query parameters", parsed.error.issues.map((i) => i.message));
    }

    const result = await db.getMediaFiles(parsed.data);
    res.status(200).json({
      success: true,
      message: "Fetch media files success",
      data: {
        files: result.files.map(publicMediaFile),
        pagination: result.pagination,
      },
    });
  } catch (e) {
    logger("ALL_MEDIA_FILES").error(e);
    return serverError(res, e, "Failed to fetch media files.");
  }
});

/**
 * @swagger
 * /api/media/images/{imageId}:
 * get:
 * summary: Redirect to the actual image URL by ID
 * tags: [Media]
 */
router.get("/images/:imageId", mediaRateLimiter, async (req, res) => {
  try {
    const { imageId } = req.params;
    const image = await db.findImageById(imageId);
    if (!image) return clientError(res, 404, "Image Id not found");
    res.redirect(image.url);
  } catch (e) {
    logger("GET_MEDIA_IMAGE_PROXIED").error(e);
    return serverError(res, e, "Failed to retrieve image.");
  }
});

/**
 * @swagger
 * /api/media/files/{fileId}:
 * get:
 * summary: Retrieve media file metadata and direct URL
 * tags: [Media]
 */
router.get("/files/:fileId", mediaRateLimiter, async (req, res) => {
  try {
    const { fileId } = req.params;
    const file = await db.getMediaFileById(fileId);
    if (!file) return clientError(res, 404, "File Id not found");

    res.status(200).json({
      success: true,
      message: "Fetch media file success",
      data: { file: publicMediaFile(file), url: file.url },
    });
  } catch (e) {
    logger("GET_MEDIA_FILE").error(e);
    return serverError(res, e, "Failed to fetch media file.");
  }
});

/**
 * @swagger
 * /api/media/images/new:
 * post:
 * summary: Upload a new image
 * tags: [Media]
 */
router.post(
  "/images/new",
  mediaRateLimiter,
  uploadMiddleware,
  async (req, res) => {
    try {
      if (!req.file) return clientError(res, 400, "No image file uploaded");

      const uploaded = await uploadImage(req.file);
      const id = generateToken(32);

      await db.addImage(id, {
        public_id: uploaded.public_id,
        url: uploaded.secure_url || uploaded.url,
      });
      await services.logActivity({
        type: "media.uploaded",
        actorId: req.user?.userId || null,
        entityId: id,
        entityType: "media",
        message: "New media image uploaded",
        meta: { mediaType: "image", publicId: uploaded.public_id },
      });
      await services.recordAnalyticsEvent({
        pageViewsDelta: 1,
        trafficSource: "Direct",
      });

      res.status(201).json({
        success: true,
        message: "Image uploaded successfully",
        data: { id, url: uploaded.secure_url || uploaded.url },
      });
    } catch (e) {
      logger("ADD_MEDIA_IMAGES").error(e);
      return serverError(res, e, "Upload process failed.");
    }
  },
);

/**
 * @swagger
 * /api/media/files:
 * post:
 * summary: Upload a general media file
 * tags: [Media]
 */
router.post(
  "/files",
  mediaRateLimiter,
  fileUploadMiddleware,
  async (req, res) => {
    try {
      if (!req.file) return clientError(res, 400, "No file uploaded");

      const uploaded = await uploadGeneralFile(req.file);
      const url = uploaded.secure_url || uploaded.url;
      const id = generateToken(32);
      const record = buildMediaFileRecord({
        id,
        fileName: req.file.originalname || uploaded.original_filename || id,
        type: inferMediaType(req.file.mimetype),
        mimeType: req.file.mimetype || "application/octet-stream",
        sizeBytes: Number(req.file.size) || Number(uploaded.bytes) || 0,
        storageProvider: "cloudinary",
        publicId: uploaded.public_id || null,
        resourceType: uploaded.resource_type || null,
        url,
        uploadedBy: req.user?.userId || null,
      });

      const parsed = mediaFileSchema.safeParse(record);
      if (!parsed.success) {
        if (uploaded.public_id) await deleteCloudinaryAsset(uploaded.public_id, uploaded.resource_type);
        return clientError(res, 400, "Invalid uploaded file metadata", parsed.error.issues.map((i) => i.message));
      }

      const saved = await db.addMediaFile(parsed.data);
      await services.logActivity({
        type: "media.uploaded",
        actorId: req.user?.userId || null,
        entityId: id,
        entityType: "mediaFile",
        message: "New media file uploaded",
        meta: { mediaType: parsed.data.type, publicId: parsed.data.publicId, resourceType: parsed.data.resourceType },
      });

      res.status(201).json({
        success: true,
        message: "File uploaded successfully",
        data: { file: publicMediaFile(saved), url: parsed.data.url },
      });
    } catch (e) {
      logger("ADD_MEDIA_FILE").error(e);
      return serverError(res, e, "File upload process failed.");
    }
  },
);

/**
 * @swagger
 * /api/media/files/url:
 * post:
 * summary: Register an HTTPS media file URL
 * tags: [Media]
 */
router.post("/files/url", mediaRateLimiter, async (req, res) => {
  try {
    const parsed = registerFileUrlSchema.safeParse(req.body);
    if (!parsed.success) {
      return clientError(res, 400, "Invalid file URL payload", parsed.error.issues.map((i) => i.message));
    }

    const id = generateToken(32);
    const fileName = parsed.data.fileName || new URL(parsed.data.url).pathname.split("/").filter(Boolean).pop() || id;
    const record = buildMediaFileRecord({
      id,
      fileName,
      type: parsed.data.type,
      mimeType: parsed.data.mimeType,
      sizeBytes: parsed.data.sizeBytes,
      storageProvider: "other",
      publicId: null,
      resourceType: null,
      url: parsed.data.url,
      uploadedBy: req.user?.userId || null,
    });

    const valid = mediaFileSchema.safeParse(record);
    if (!valid.success) {
      return clientError(res, 400, "Invalid file metadata", valid.error.issues.map((i) => i.message));
    }

    const saved = await db.addMediaFile(valid.data);
    await services.logActivity({
      type: "media.uploaded",
      actorId: req.user?.userId || null,
      entityId: id,
      entityType: "mediaFile",
      message: "Media file URL registered",
      meta: { mediaType: valid.data.type, storageProvider: valid.data.storageProvider },
    });

    res.status(201).json({
      success: true,
      message: "File URL registered successfully",
      data: { file: publicMediaFile(saved), url: valid.data.url },
    });
  } catch (e) {
    logger("REGISTER_MEDIA_FILE_URL").error(e);
    return serverError(res, e, "Failed to register file URL.");
  }
});

/**
 * @swagger
 * /api/media/images/{imageId}/replace:
 * put:
 * summary: Replace an existing image
 * tags: [Media]
 */
router.put(
  "/images/:imageId/replace",
  mediaRateLimiter,
  uploadMiddleware,
  async (req, res) => {
    try {
      if (!req.file) return clientError(res, 400, "No image file uploaded");

      const { imageId } = req.params;
      const image = await db.findImageById(imageId);
      if (!image) return clientError(res, 404, "Image Id not found");

      const uploaded = await uploadImage(req.file);
      if (image.public_id) await deleteImage(image.public_id);
      await db.updateImageById(imageId, {
        public_id: uploaded.public_id,
        url: uploaded.secure_url || uploaded.url,
      });

      await services.logActivity({
        type: "media.uploaded",
        actorId: req.user?.userId || null,
        entityId: imageId,
        entityType: "media",
        message: "Media image replaced",
        meta: { mediaType: "image", publicId: uploaded.public_id },
      });
      await services.recordAnalyticsEvent({
        pageViewsDelta: 1,
        trafficSource: "Direct",
      });

      res.status(200).json({
        success: true,
        message: "Image replaced successfully",
        data: { id: imageId, url: uploaded.secure_url || uploaded.url },
      });
    } catch (e) {
      logger("REPLACE_MEDIA_IMAGE").error(e);
      return serverError(res, e, "Replace operation failed.");
    }
  },
);

/**
 * @swagger
 * /api/media/files/{fileId}:
 * delete:
 * summary: Delete media file metadata and provider asset when present
 * tags: [Media]
 */
router.delete("/files/:fileId", mediaRateLimiter, async (req, res) => {
  try {
    const { fileId } = req.params;
    const file = await db.getMediaFileById(fileId);
    if (!file) return clientError(res, 404, "File Id not found");

    if (file.publicId) {
      await deleteCloudinaryAsset(file.publicId, resolveCloudinaryResourceType(file));
    }

    await db.deleteMediaFileById(fileId);
    await services.logActivity({
      type: "media.deleted",
      actorId: req.user?.userId || null,
      entityId: fileId,
      entityType: "mediaFile",
      message: "Media file deleted",
      meta: { mediaType: file.type, publicId: file.publicId || null, resourceType: file.resourceType || null },
    });

    res.status(200).json({
      success: true,
      message: "File deleted successfully",
      data: { id: fileId },
    });
  } catch (e) {
    logger("DELETE_MEDIA_FILE").error(e);
    return serverError(res, e, "Failed to delete media file.");
  }
});

module.exports = router;
