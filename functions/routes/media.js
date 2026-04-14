/** IMPORT */
const express = require("express");
const multer = require("multer");

// <-- LOCAL EXPORTS IMPORTS -->
const middlewares = require("../middlewares");
const {
  logger,
  uploadImage,
  deleteImage,
  generateToken,
} = require("../helpers");
const db = require("../db");

/** SETUP */
const router = express.Router();
const { media: mediaRateLimiter } = middlewares.rateLimiters;

// Configured for 10MB limit as per your request
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"), false);
    }
  },
  storage: multer.memoryStorage(),
});

const uploadMiddlewareHandler = upload.single("image");

const uploadMiddleware = (req, res, next) => {
  uploadMiddlewareHandler(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: "Media upload error",
        error: err.message,
      });
    }
    next();
  });
};

/** IMAGE ROUTES */

router.get("/images/all", mediaRateLimiter, async (req, res) => {
  try {
    const images = await db.getImages();
    res.status(200).json({
      success: true,
      message: "Fetch media success",
      data: {
        images: images.map(({ id, url }) => ({ id, url })),
      },
    });
  } catch (e) {
    logger("ALL_MEDIA_IMAGES").error(e);
    res
      .status(400)
      .json({ success: false, message: "An unknown error occurred" });
  }
});

router.post(
  "/images/new",
  mediaRateLimiter,
  uploadMiddleware,
  async (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, message: "No image file uploaded" });
      }

      const uploaded = await uploadImage(req.file);
      const id = generateToken(32);

      // Store public_id and secure_url in DB
      await db.addImage(id, {
        public_id: uploaded.public_id,
        url: uploaded.secure_url,
      });

      res.status(201).json({
        success: true,
        message: "Image uploaded successfully",
        data: { id, url: uploaded.secure_url },
      });
    } catch (e) {
      logger("ADD_MEDIA_IMAGES").error(e);
      res
        .status(400)
        .json({ success: false, message: "Upload process failed" });
    }
  },
);

router.put(
  "/images/:imageId/replace",
  mediaRateLimiter,
  uploadMiddleware,
  async (req, res) => {
    try {
      if (!req.file)
        return res
          .status(400)
          .json({ success: false, message: "No file provided" });

      const { imageId } = req.params;
      const image = await db.findImageById(imageId);
      if (!image)
        return res
          .status(404)
          .json({ success: false, message: "Image not found" });

      const uploaded = await uploadImage(req.file);

      // Clean up the old image from Cloudinary to save space
      if (image.public_id) await deleteImage(image.public_id);

      await db.updateImageById(imageId, {
        public_id: uploaded.public_id,
        url: uploaded.secure_url,
      });

      res.status(200).json({
        success: true,
        message: "Image replaced successfully",
        data: { id: imageId, url: uploaded.secure_url },
      });
    } catch (e) {
      logger("REPLACE_MEDIA_IMAGE").error(e);
      res
        .status(400)
        .json({ success: false, message: "Replace operation failed" });
    }
  },
);

/** STRING ROUTES (For smaller text-based media) */

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

module.exports = router;
