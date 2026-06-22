const express = require("express");
const multer = require("multer");

const db = require("../db");
const {
  logger,
  uploadProfilePicture,
  deleteCloudinaryAsset,
  serverError,
  clientError,
} = require("../helpers");

const router = express.Router();

const profileImageUpload = multer({
  limits: { fileSize: 5 * 1024 * 1024 },
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    const allowedExtensions = /\.(jpe?g|png|webp)$/i;

    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(new Error("Profile image must be a JPEG, PNG, or WebP image"), false);
    }

    if (!allowedExtensions.test(file.originalname || "")) {
      return cb(new Error("Profile image file extension must be .jpg, .jpeg, .png, or .webp"), false);
    }

    return cb(null, true);
  },
});

const profileImageUploadHandler = profileImageUpload.single("image");
const profileImageUploadMiddleware = (req, res, next) => {
  profileImageUploadHandler(req, res, (err) => {
    if (!err) return next();

    return res.status(400).json({
      success: false,
      message: "Profile image upload error",
      data: { error: err.message },
    });
  });
};

function getCurrentUserId(req) {
  return req.user?.userId || req.db_user?.userId;
}

function canManageProfileImage(req) {
  return ["admin", "staff"].includes(req.db_user?.role);
}

function formatProfileImage(user) {
  if (!user) return null;

  return {
    userId: user.userId,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: user.fullName,
    role: user.role,
    avatarUrl: user.avatarUrl || null,
    avatarPublicId: user.avatarPublicId || null,
    avatarResourceType: user.avatarResourceType || null,
  };
}

async function deleteExistingProfileImage(user, scope) {
  if (!user?.avatarPublicId) return;

  try {
    await deleteCloudinaryAsset(user.avatarPublicId, user.avatarResourceType || "image");
  } catch (error) {
    logger(scope).error(error);
  }
}

async function upsertCurrentUserProfileImage(req, res, logScope, successMessage) {
  try {
    const userId = getCurrentUserId(req);
    if (!userId) return clientError(res, 401, "Authentication required");
    if (!canManageProfileImage(req)) {
      return clientError(res, 403, "Only admin and staff users can manage profile images");
    }
    if (!req.file) return clientError(res, 400, "No profile image uploaded");

    const existingUser = await db.getUserById(userId);
    if (!existingUser) return clientError(res, 404, "User not found");

    const uploaded = await uploadProfilePicture(req.file);
    await deleteExistingProfileImage(existingUser, "DELETE_OLD_PROFILE_IMAGE");

    const profileImage = await db.updateUserProfileImage(userId, {
      avatarUrl: uploaded.secure_url || uploaded.url,
      avatarPublicId: uploaded.public_id || null,
      avatarResourceType: uploaded.resource_type || "image",
    });

    return res.status(200).json({
      success: true,
      message: successMessage,
      data: { profileImage: formatProfileImage(profileImage) },
    });
  } catch (error) {
    logger(logScope).error(error);

    if (error.statusCode === 400) {
      return clientError(res, 400, error.message);
    }

    return serverError(res, error, "Failed to update profile image.");
  }
}

/**
 * @route   GET /api/settings/profile-image
 * @desc    Get current user's profile image
 * @access  Private
 */
router.get("/profile-image", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    if (!userId) return clientError(res, 401, "Authentication required");

    const profileImage = await db.getUserProfileImage(userId);
    if (!profileImage) return clientError(res, 404, "User not found");

    return res.status(200).json({
      success: true,
      message: "Profile image fetched successfully",
      data: { profileImage: formatProfileImage(profileImage) },
    });
  } catch (error) {
    logger("GET_PROFILE_IMAGE").error(error);
    return serverError(res, error, "Failed to fetch profile image.");
  }
});

/**
 * @route   POST /api/settings/profile-image
 * @desc    Upload current user's profile image
 * @access  Private admin/staff
 */
router.post("/profile-image", profileImageUploadMiddleware, async (req, res) => {
  return upsertCurrentUserProfileImage(req, res, "UPLOAD_PROFILE_IMAGE", "Profile image uploaded successfully");
});

/**
 * @route   PUT /api/settings/profile-image
 * @desc    Replace current user's profile image
 * @access  Private admin/staff
 */
router.put("/profile-image", profileImageUploadMiddleware, async (req, res) => {
  return upsertCurrentUserProfileImage(req, res, "REPLACE_PROFILE_IMAGE", "Profile image updated successfully");
});

/**
 * @route   DELETE /api/settings/profile-image
 * @desc    Remove current user's profile image
 * @access  Private admin/staff
 */
router.delete("/profile-image", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    if (!userId) return clientError(res, 401, "Authentication required");
    if (!canManageProfileImage(req)) {
      return clientError(res, 403, "Only admin and staff users can manage profile images");
    }

    const existingUser = await db.getUserById(userId);
    if (!existingUser) return clientError(res, 404, "User not found");

    await deleteExistingProfileImage(existingUser, "DELETE_PROFILE_IMAGE_ASSET");
    const profileImage = await db.clearUserProfileImage(userId);

    return res.status(200).json({
      success: true,
      message: "Profile image removed successfully",
      data: { profileImage: formatProfileImage(profileImage) },
    });
  } catch (error) {
    logger("REMOVE_PROFILE_IMAGE").error(error);
    return serverError(res, error, "Failed to remove profile image.");
  }
});

/**
 * @route   GET /api/settings/users/:userId/profile-image
 * @desc    Get another user's profile image
 * @access  Private
 */
router.get("/users/:userId/profile-image", async (req, res) => {
  try {
    const profileImage = await db.getUserProfileImage(req.params.userId);
    if (!profileImage) return clientError(res, 404, "User not found");

    return res.status(200).json({
      success: true,
      message: "Profile image fetched successfully",
      data: { profileImage: formatProfileImage(profileImage) },
    });
  } catch (error) {
    logger("GET_USER_PROFILE_IMAGE").error(error);
    return serverError(res, error, "Failed to fetch profile image.");
  }
});

module.exports = router;
