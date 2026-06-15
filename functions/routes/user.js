/** IMPORT
 * All libraries / local exports / packages are imported here
 */

// <-- PACKAGE IMPORTS -->
const express = require('express');
const multer = require('multer');

// <-- LOCAL EXPORTS IMPORTS -->
const middlewares = require('../middlewares');
const { logger, serverError, clientError, uploadProfilePicture, deleteCloudinaryAsset } = require('../helpers');
const db = require('../db');


/** SETUP
 * Global variables referenced in this file are defined here
 */
const router = express.Router();

const profilePictureUpload = multer({
    limits: { fileSize: 5 * 1024 * 1024 },
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
        const allowedExtensions = /\.(jpe?g|png|webp)$/i;

        if (!allowedMimeTypes.has(file.mimetype)) {
            return cb(new Error('Profile picture must be a JPEG, PNG, or WebP image'), false);
        }

        if (!allowedExtensions.test(file.originalname || '')) {
            return cb(new Error('Profile picture file extension must be .jpg, .jpeg, .png, or .webp'), false);
        }

        return cb(null, true);
    },
});

const profilePictureUploadHandler = profilePictureUpload.single('picture');
const profilePictureUploadMiddleware = (req, res, next) => {
    profilePictureUploadHandler(req, res, (err) => {
        if (!err) return next();

        return res.status(400).json({
            success: false,
            message: 'Profile picture upload error',
            data: { error: err.message },
        });
    });
};

function publicProfile(user) {
    return {
        userId: user.userId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role || 'staff',
        avatarUrl: user.avatarUrl || null,
    };
}

/** MAIN USER ROUTES */
router.get('/profile', async (req, res) => {
    try {
        const user = req.db_user;

        /** Extra validation if user exists in the db */
        if (!user) {
            return clientError(res, 401, 'Invalid User');
        }

        res.status(200).json({
            success: true,
            message: 'Fetch profile success',
            data: {
                profile: publicProfile(user),
            }
        });
    } catch (e) {
        logger('GET_PROFILE').error(e);
        return serverError(res, e, 'Failed to fetch profile.');
    }
});

router.put('/profile/picture', profilePictureUploadMiddleware, async (req, res) => {
    try {
        const user = req.db_user;

        if (!user) {
            return clientError(res, 401, 'Invalid User');
        }

        if (!req.file) {
            return clientError(res, 400, 'No profile picture uploaded');
        }

        const uploaded = await uploadProfilePicture(req.file);

        if (user.avatarPublicId) {
            try {
                await deleteCloudinaryAsset(user.avatarPublicId, user.avatarResourceType || 'image');
            } catch (deleteError) {
                logger('DELETE_OLD_PROFILE_PICTURE').error(deleteError);
            }
        }

        const updateData = {
            avatarUrl: uploaded.secure_url || uploaded.url,
            avatarPublicId: uploaded.public_id,
            avatarResourceType: uploaded.resource_type || 'image',
        };

        await db.updateUser(user.userId, updateData);

        res.status(200).json({
            success: true,
            message: 'Profile picture updated successfully',
            data: {
                profile: publicProfile({ ...user, ...updateData }),
            }
        });
    } catch (e) {
        logger('UPDATE_PROFILE_PICTURE').error(e);

        if (e.statusCode === 400) {
            return clientError(res, 400, e.message);
        }

        return serverError(res, e, 'Failed to update profile picture.');
    }
});

router.delete('/profile/picture', async (req, res) => {
    try {
        const user = req.db_user;

        if (!user) {
            return clientError(res, 401, 'Invalid User');
        }

        if (user.avatarPublicId) {
            try {
                await deleteCloudinaryAsset(user.avatarPublicId, user.avatarResourceType || 'image');
            } catch (deleteError) {
                logger('DELETE_PROFILE_PICTURE_ASSET').error(deleteError);
            }
        }

        const updateData = {
            avatarUrl: null,
            avatarPublicId: null,
            avatarResourceType: null,
        };

        await db.updateUser(user.userId, updateData);

        res.status(200).json({
            success: true,
            message: 'Profile picture removed successfully',
            data: {
                profile: publicProfile({ ...user, ...updateData }),
            }
        });
    } catch (e) {
        logger('DELETE_PROFILE_PICTURE').error(e);
        return serverError(res, e, 'Failed to remove profile picture.');
    }
});

/** EXPORTS
 * Export Routes for use in routers
 */
module.exports = router;
