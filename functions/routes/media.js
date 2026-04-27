const express = require("express");
const multer = require("multer");

const middlewares = require("../middlewares");
const {
  logger,
  uploadImage,
  deleteImage,
  generateToken,
} = require("../helpers");
const db = require("../db");
const services = require("../services");

const router = express.Router();
const { media: mediaRateLimiter } = middlewares.rateLimiters;

/**
 * @swagger
 * tags:
 * name: Media
 * description: Image upload and string management API
 */

const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"), false);
  },
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
    res
      .status(400)
      .json({ success: false, message: "An unknown error occurred" });
  }
});

/**
 * @swagger
 * /api/media/images/{imageId}:
 * get:
 * summary: Redirect to the actual image URL by ID
 * tags: [Media]
 * parameters:
 * - in: path
 * name: imageId
 * required: true
 * schema:
 * type: string
 * responses:
 * 302:
 * description: Redirecting to image source
 * 404:
 * description: Image not found
 */
router.get("/images/:imageId", mediaRateLimiter, async (req, res) => {
  try {
    const { imageId } = req.params;
    const image = await db.findImageById(imageId);
    if (!image)
      return res
        .status(404)
        .json({ success: false, message: "Image Id not found" });
    res.redirect(image.url);
  } catch (e) {
    logger("GET_MEDIA_IMAGE_PROXIED").error(e);
    res.status(500).send("Server Error");
  }
});

/**
 * @swagger
 * /api/media/images/new:
 * post:
 * summary: Upload a new image
 * tags: [Media]
 * requestBody:
 * required: true
 * content:
 * multipart/form-data:
 * schema:
 * type: object
 * properties:
 * image:
 * type: string
 * format: binary
 * responses:
 * 201:
 * description: Image uploaded successfully
 */
router.post(
  "/images/new",
  mediaRateLimiter,
  uploadMiddleware,
  async (req, res) => {
    try {
      if (!req.file)
        return res
          .status(400)
          .json({ success: false, message: "No image file uploaded" });

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
      res
        .status(400)
        .json({ success: false, message: "Upload process failed" });
    }
  },
);

/**
 * @swagger
 * /api/media/images/{imageId}/replace:
 * put:
 * summary: Replace an existing image
 * tags: [Media]
 * parameters:
 * - in: path
 * name: imageId
 * required: true
 * schema:
 * type: string
 * requestBody:
 * required: true
 * content:
 * multipart/form-data:
 * schema:
 * type: object
 * properties:
 * image:
 * type: string
 * format: binary
 * responses:
 * 200:
 * description: Image replaced successfully
 */
router.put(
  "/images/:imageId/replace",
  mediaRateLimiter,
  uploadMiddleware,
  async (req, res) => {
    try {
      if (!req.file)
        return res
          .status(400)
          .json({ success: false, message: "No image file uploaded" });

      const { imageId } = req.params;
      const image = await db.findImageById(imageId);
      if (!image)
        return res
          .status(404)
          .json({ success: false, message: "Image Id not found" });

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
      res
        .status(400)
        .json({ success: false, message: "Replace operation failed" });
    }
  },
);

/**
 * @swagger
 * /api/media/strings/all:
 * get:
 * summary: Get all stored media strings
 * tags: [Media]
 * responses:
 * 200:
 * description: Success
 */
router.get("/strings/all", mediaRateLimiter, async (req, res) => {
  try {
    const strings = await db.getMediaStrings();
    res.status(200).json({
      success: true,
      message: "Fetch media strings success",
      data: { strings: strings.map(({ _id, ...rest }) => rest) },
    });
  } catch (e) {
    logger("ALL_MEDIA_STRINGS").error(e);
    res
      .status(400)
      .json({ success: false, message: "An unknown error occured" });
  }
});

/**
 * @swagger
 * /api/media/strings/new:
 * post:
 * summary: Store a new media string
 * tags: [Media]
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * string:
 * type: string
 * responses:
 * 201:
 * description: String stored successfully
 */
router.post("/strings/new", mediaRateLimiter, async (req, res) => {
  try {
    const { string } = req.body;
    const id = generateToken(32);
    await db.storeMediaString(id, string);
    res
      .status(201)
      .json({
        success: true,
        message: "String stored successfully",
        data: { id },
      });
  } catch (e) {
    logger("ADD_MEDIA_STRING").error(e);
    res.status(400).json({ success: false, message: "Failed to store string" });
  }
});

/**
 * @swagger
 * /api/media/strings/{stringId}/replace:
 * put:
 * summary: Update an existing media string
 * tags: [Media]
 * parameters:
 * - in: path
 * name: stringId
 * required: true
 * schema:
 * type: string
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * string:
 * type: string
 * responses:
 * 200:
 * description: Update success
 */
router.put("/strings/:stringId/replace", mediaRateLimiter, async (req, res) => {
  try {
    const { stringId } = req.params;
    const { string } = req.body;
    await db.updateMediaString(stringId, string);
    res
      .status(200)
      .json({ success: true, message: "Replace media string success" });
  } catch (e) {
    logger("REPLACE_MEDIA_STRING").error(e);
    res
      .status(400)
      .json({ success: false, message: "An unknown error occured" });
  }
});

/**
 * @swagger
 * /api/media/strings/{stringId}:
 * get:
 * summary: Retrieve a specific string by ID
 * tags: [Media]
 * parameters:
 * - in: path
 * name: stringId
 * required: true
 * schema:
 * type: string
 * responses:
 * 200:
 * description: Returns the raw string content
 */
router.get("/strings/:stringId", async (req, res) => {
  try {
    const { stringId } = req.params;
    const string = await db.getMediaStringById(stringId);
    if (!string)
      return res
        .status(404)
        .json({ success: false, message: "String Id not found" });
    res.status(200).end(string.string);
  } catch (e) {
    logger("GET_STRING").error(e);
    res.status(500).send("Server Error");
  }
});

module.exports = router;
