/** IMPORT */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { v2: cloudinary } = require("cloudinary");
const streamifier = require("streamifier");
const logger = require("../helpers/logger");

/** CONFIG */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const LOCAL_UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
const LOCAL_UPLOAD_BASE_URL = (process.env.SERVER_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const ENABLE_LOCAL_UPLOAD_FALLBACK = /^true$/i.test(process.env.ENABLE_LOCAL_UPLOAD_FALLBACK || "false");

function getLocalStorageFolder(folder) {
  const folderName = String(folder || "").trim().replace(/\/+$/, "").split("/").pop();
  return folderName || "files";
}

function generateLocalFilename(file) {
  const extension = path.extname(file.originalname || "") || "";
  return `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${extension}`;
}

function buildLocalUrl(folderName, fileName) {
  return `${LOCAL_UPLOAD_BASE_URL}/uploads/${folderName}/${encodeURIComponent(fileName)}`;
}

async function uploadLocally(file, folder) {
  const localFolder = getLocalStorageFolder(folder);
  const filename = generateLocalFilename(file);
  const destinationDir = path.join(LOCAL_UPLOADS_DIR, localFolder);
  await fs.promises.mkdir(destinationDir, { recursive: true });
  const filePath = path.join(destinationDir, filename);
  await fs.promises.writeFile(filePath, file.buffer);

  const url = buildLocalUrl(localFolder, filename);
  return {
    secure_url: url,
    url,
    public_id: null,
    resource_type: null,
    bytes: file.buffer.length,
    original_filename: file.originalname || filename,
    storageProvider: "local",
  };
}

const PROFILE_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PROFILE_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const CLOUDINARY_DELETE_RESOURCE_TYPES = new Set(["image", "video", "raw"]);

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function getFileExtension(file) {
  return path.extname(file?.originalname || "").toLowerCase();
}

function hasValidProfileImageSignature(file) {
  const buffer = file?.buffer;
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;

  if (file.mimetype === "image/jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  if (file.mimetype === "image/png") {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }

  if (file.mimetype === "image/webp") {
    return buffer.slice(0, 4).toString("ascii") === "RIFF" && buffer.slice(8, 12).toString("ascii") === "WEBP";
  }

  return false;
}

function validateProfilePicture(file) {
  if (!file) throw validationError("No profile picture uploaded");

  if (!PROFILE_IMAGE_MIME_TYPES.has(file.mimetype)) {
    throw validationError("Profile picture must be a JPEG, PNG, or WebP image");
  }

  if (!PROFILE_IMAGE_EXTENSIONS.has(getFileExtension(file))) {
    throw validationError("Profile picture file extension must be .jpg, .jpeg, .png, or .webp");
  }

  if (!hasValidProfileImageSignature(file)) {
    throw validationError("Profile picture content does not match an allowed image format");
  }
}

function uploadBuffer(file, options, failureMessage) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (result) return resolve(result);
      logger("CLOUDINARY_UPLOAD").error(error);
      return reject(new Error(failureMessage));
    });

    streamifier.createReadStream(file.buffer).pipe(uploadStream);
  });
}

async function uploadWithFallback(file, options, failureMessage) {
  try {
    return await uploadBuffer(file, options, failureMessage);
  } catch (error) {
    try {
      return await cloudinary.uploader.upload(
        `data:${file.mimetype};base64,${file.buffer.toString("base64")}`,
        options,
      );
    } catch (fallbackError) {
      logger("CLOUDINARY_UPLOAD").error(fallbackError);
      if (ENABLE_LOCAL_UPLOAD_FALLBACK) {
        logger("CLOUDINARY_UPLOAD_FALLBACK").warn(
          `Cloudinary upload failed for ${file.originalname || "unknown file"}; using local fallback.`,
        );
        return await uploadLocally(file, options.folder);
      }
      throw new Error(failureMessage);
    }
  }
}

async function uploadImage(file) {
  return uploadWithFallback(file, { folder: "atlas-africa", resource_type: "image" }, "Failed to upload image to Cloudinary");
}

async function uploadProfilePicture(file) {
  validateProfilePicture(file);
  return uploadWithFallback(
    file,
    {
      folder: "atlas-africa/profile-pictures",
      resource_type: "image",
      allowed_formats: ["jpg", "jpeg", "png", "webp"],
    },
    "Failed to upload profile picture to Cloudinary",
  );
}

async function uploadGeneralFile(file) {
  if (!file) throw validationError("No file uploaded");
  return uploadWithFallback(
    file,
    {
      folder: "atlas-africa/files",
      resource_type: "auto",
      use_filename: true,
      unique_filename: true,
    },
    "Failed to upload file to Cloudinary",
  );
}

async function deleteCloudinaryAsset(publicId, resourceType = "image") {
  if (!publicId) return null;

  const safeResourceType = CLOUDINARY_DELETE_RESOURCE_TYPES.has(resourceType) ? resourceType : "image";

  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: safeResourceType });
    if (!result || (result.result !== "ok" && result.result !== "not found")) {
      logger("CLOUDINARY_DELETE").error(
        `Delete failed for ID: ${publicId}`,
        result,
      );
    }
    return result;
  } catch (error) {
    logger("CLOUDINARY_DELETE").error(error);
    throw new Error("Failed to delete file from Cloudinary");
  }
}

async function deleteImage(publicId) {
  return deleteCloudinaryAsset(publicId, "image");
}

module.exports = {
  uploadImage,
  uploadProfilePicture,
  uploadGeneralFile,
  deleteImage,
  deleteCloudinaryAsset,
  validateProfilePicture,
  PROFILE_IMAGE_MIME_TYPES,
  PROFILE_IMAGE_EXTENSIONS,
};
