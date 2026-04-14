/** IMPORT
 * All libraries / local exports / packages are imported here
 */

// <-- PACKAGE IMPORTS -->
const express = require('express');
const multer = require('multer');

// <-- LOCAL EXPORTS IMPORTS -->
const middlewares = require('../middlewares');
const { logger, uploadImage, deleteImage, generateToken } = require('../helpers');
const db = require('../db');
const services = require('../services');

/** SETUP
 * Global variables referenced in this file are defined here
 */
const router = express.Router();
const { media } = middlewares.rateLimiters;

const upload = multer({
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    },
    storage: multer.memoryStorage()
});

const uploadMiddlewareHandler = upload.single('image');
const uploadMiddleware = (req, res, next) => {
    uploadMiddlewareHandler(req, res, (err) => {
        if (err) {
            return res.status(400).json({
                success: false,
                message: 'An error occured while uploading the image for this product',
                data: {
                    error: err.message
                }
            });
        }
        next();
    });
};

router.get('/images/all', media, async (req, res) => {
    try {
        const images = await db.getImages();

        res.status(200).json({
            success: true,
            message: 'Fetch media (images) success',
            data: {
                images: images.map(({ _id, id }) => ({
                    id,
                    url: `${process.env.SERVER_BASE_URL}/api/media/images/${id}`
                }))
            }
        });
    } catch (e) {
        logger('ALL_MEDIA_IMAGES').error(e);
        res.status(400).json({
            success: false, message: 'An unknown error occured'
        })
    }
});

router.get('/images/:imageId', media, async (req, res) => {
    try {
        const { imageId } = req.params;
        const image = await db.findImageById(imageId);
        if (!image) return res.status(404).json({
            success: false,
            message: 'Image Id not found'
        });

        res.redirect(image.url);
    } catch (e) {
        logger('GET_MEDIA_IMAGE_PROXIED').error(e);
        res.status(500).send('Server Error');
    }
});

router.post('/images/new', media, uploadMiddleware, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No image file uploaded'
            })
        }
        const uploaded = await uploadImage(req.file);
        const id = generateToken(32);

        await db.addImage(id, uploaded);
        await services.logActivity({
            type: 'media.uploaded',
            actorId: req.user?.userId || null,
            entityId: id,
            entityType: 'media',
            message: 'New media image uploaded',
            meta: {
                mediaType: 'image',
                publicId: uploaded.public_id
            }
        });
        await services.recordAnalyticsEvent({
            pageViewsDelta: 1,
            trafficSource: 'Direct'
        });

        res.status(200).json({
            success: true,
            message: 'Add media (images) success'
        });
    } catch (e) {
        logger('ADD_MEDIA_IMAGES').error(e);
        res.status(400).json({
            success: false, message: 'An unknown error occured'
        })
    }
});

router.put('/images/:imageId/replace', media, uploadMiddleware, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No image file uploaded'
            })
        }
        const { imageId } = req.params;
        const image = await db.findImageById(imageId);
        if (!image) return res.status(404).json({
            success: false,
            message: 'Image Id not found'
        });

        const uploaded = await uploadImage(req.file);
        deleteImage(image.public_id);

        await db.updateImageById(imageId, uploaded);
        await services.logActivity({
            type: 'media.uploaded',
            actorId: req.user?.userId || null,
            entityId: imageId,
            entityType: 'media',
            message: 'Media image replaced',
            meta: {
                mediaType: 'image',
                publicId: uploaded.public_id
            }
        });
        await services.recordAnalyticsEvent({
            pageViewsDelta: 1,
            trafficSource: 'Direct'
        });

        res.status(200).json({
            success: true,
            message: 'Replace media (images) success'
        });
    } catch (e) {
        logger('ALL_MEDIA_IMAGES').error(e);
        res.status(400).json({
            success: false, message: 'An unknown error occured'
        })
    }
});

router.get('/strings/all', media, async (req, res) => {
    try {
        const strings = await db.getMediaStrings();

        res.status(200).json({
            success: true,
            message: 'Fetch media (strings) success',
            data: {
                strings: strings.map(({ _id, ...$rest }) => ($rest))
            }
        });
    } catch (e) {
        logger('ALL_MEDIA_STRINGS').error(e);
        res.status(400).json({
            success: false, message: 'An unknown error occured'
        })
    }
});

router.post('/strings/new', media, async (req, res) => {
    try {
        const { string } = req.body;

        await db.storeMediaString(generateToken(32), string);

        res.status(200).json({
            success: true,
            message: 'Add media (string) success'
        });
    } catch (e) {
        logger('ADD_MEDIA_STRING').error(e);
        res.status(400).json({
            success: false, message: 'An unknown error occured'
        })
    }
});

router.put('/strings/:stringId/replace', media, async (req, res) => {
    try {
        const { stringId } = req.params;
        const { string } = req.body;

        await db.updateMediaString(stringId, string);

        res.status(200).json({
            success: true,
            message: 'Replace media (string) success'
        });
    } catch (e) {
        logger('ALL_MEDIA_IMAGES').error(e);
        res.status(400).json({
            success: false, message: 'An unknown error occured'
        })
    }
});

router.get('/strings/:stringId', async (req, res) => {
    try {
        const { stringId } = req.params;
        const string = await db.getMediaStringById(stringId);
        if(!string) return res.status(404).json({
            success: false,
            message: 'String Id not found'
        });

        res.status(200).end(string.string);
    } catch (e) {
        logger('GET_STRING').error(e);
        res.status(500).send('Server Error');
    }
});

/** EXPORTS
 * Export Routes for use in routers
 */
module.exports = router;
