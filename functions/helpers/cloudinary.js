/** IMPORT */
const { v2: cloudinary } = require("cloudinary");
const streamifier = require("streamifier");
const logger = require("../helpers/logger");

/** CONFIG */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadImage(file) {
  try {
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: "atlas-africa" },
        (error, result) => {
          if (result) return resolve(result);
          logger("CLOUDINARY_UPLOAD").error(error);
          return reject(new Error("Failed to upload image to Cloudinary"));
        },
      );

      streamifier.createReadStream(file.buffer).pipe(uploadStream);
    });

    return uploadResult;
  } catch (error) {
    // Fallback path for environments where streaming may fail unexpectedly.
    try {
      return await cloudinary.uploader.upload(
        `data:${file.mimetype};base64,${file.buffer.toString("base64")}`,
        { folder: "atlas-africa" },
      );
    } catch (fallbackError) {
      logger("CLOUDINARY_UPLOAD").error(fallbackError);
      throw new Error("Failed to upload image to Cloudinary");
    }
  }
}

async function deleteImage(publicId) {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    if (result.result !== "ok") {
      logger("CLOUDINARY_DELETE").error(
        `Delete failed for ID: ${publicId}`,
        result,
      );
    }
    return result;
  } catch (error) {
    logger("CLOUDINARY_DELETE").error(error);
    throw new Error("Failed to delete image from Cloudinary");
  }
}

module.exports = { uploadImage, deleteImage };
