const express = require("express");
const multer = require("multer");

const middlewares = require("../middlewares");
const { logger, uploadImage, deleteImage, generateToken } = require("../helpers");
const db = require("../db");
const services = require("../services");

const router = express.Router();
const { media: mediaRateLimiter } = middlewares.rateLimiters;

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
    res.status(400).json({ success: false, message: "An unknown error occurred" });
  }
});

router.get("/images/:imageId", mediaRateLimiter, async (req, res) => {
  try {
    const { imageId } = req.params;
    const image = await db.findImageById(imageId);
    if (!image) return res.status(404).json({ success: false, message: "Image Id not found" });
    res.redirect(image.url);
  } catch (e) {
    logger("GET_MEDIA_IMAGE_PROXIED").error(e);
    res.status(500).send("Server Error");
  }
});

router.post("/images/new", mediaRateLimiter, uploadMiddleware, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No image file uploaded" });

    const uploaded = await uploadImage(req.file);
    const id = generateToken(32);

    await db.addImage(id, { public_id: uploaded.public_id, url: uploaded.secure_url || uploaded.url });
    await services.logActivity({
      type: "media.uploaded",
      actorId: req.user?.userId || null,
      entityId: id,
      entityType: "media",
      message: "New media image uploaded",
      meta: { mediaType: "image", publicId: uploaded.public_id },
    });
    await services.recordAnalyticsEvent({ pageViewsDelta: 1, trafficSource: "Direct" });

    res.status(201).json({
      success: true,
      message: "Image uploaded successfully",
      data: { id, url: uploaded.secure_url || uploaded.url },
    });
  } catch (e) {
    logger("ADD_MEDIA_IMAGES").error(e);
    res.status(400).json({ success: false, message: "Upload process failed" });
  }
});

router.put("/images/:imageId/replace", mediaRateLimiter, uploadMiddleware, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No image file uploaded" });

    const { imageId } = req.params;
    const image = await db.findImageById(imageId);
    if (!image) return res.status(404).json({ success: false, message: "Image Id not found" });

    const uploaded = await uploadImage(req.file);
    if (image.public_id) await deleteImage(image.public_id);
    await db.updateImageById(imageId, { public_id: uploaded.public_id, url: uploaded.secure_url || uploaded.url });

    await services.logActivity({
      type: "media.uploaded",
      actorId: req.user?.userId || null,
      entityId: imageId,
      entityType: "media",
      message: "Media image replaced",
      meta: { mediaType: "image", publicId: uploaded.public_id },
    });
    await services.recordAnalyticsEvent({ pageViewsDelta: 1, trafficSource: "Direct" });

    res.status(200).json({
      success: true,
      message: "Image replaced successfully",
      data: { id: imageId, url: uploaded.secure_url || uploaded.url },
    });
  } catch (e) {
    logger("REPLACE_MEDIA_IMAGE").error(e);
    res.status(400).json({ success: false, message: "Replace operation failed" });
  }
});

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
    res.status(400).json({ success: false, message: "An unknown error occured" });
  }
});

router.post("/strings/new", mediaRateLimiter, async (req, res) => {
  try {
    const { string } = req.body;
    const id = generateToken(32);
    await db.storeMediaString(id, string);
    res.status(201).json({ success: true, message: "String stored successfully", data: { id } });
  } catch (e) {
    logger("ADD_MEDIA_STRING").error(e);
    res.status(400).json({ success: false, message: "Failed to store string" });
  }
});

router.put("/strings/:stringId/replace", mediaRateLimiter, async (req, res) => {
  try {
    const { stringId } = req.params;
    const { string } = req.body;
    await db.updateMediaString(stringId, string);
    res.status(200).json({ success: true, message: "Replace media string success" });
  } catch (e) {
    logger("REPLACE_MEDIA_STRING").error(e);
    res.status(400).json({ success: false, message: "An unknown error occured" });
  }
});

router.get("/strings/:stringId", async (req, res) => {
  try {
    const { stringId } = req.params;
    const string = await db.getMediaStringById(stringId);
    if (!string) return res.status(404).json({ success: false, message: "String Id not found" });
    res.status(200).end(string.string);
  } catch (e) {
    logger("GET_STRING").error(e);
    res.status(500).send("Server Error");
  }
});

module.exports = router;
