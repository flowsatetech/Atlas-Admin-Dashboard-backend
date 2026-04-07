/** IMPORT
 * All libraries / local exports / packages are imported here
 */

// <-- PACKAGE IMPORTS -->
const { v2: cloudinary } = require('cloudinary');

// <-- LOCAL EXPORTS IMPORTS -->
const logger = require('../helpers/logger');

/** CONFIG
 * All settings for imports are here
 */
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

async function uploadImage(file) {
    try {
        const uploadResult = await cloudinary.uploader
            .upload(
                `data:${file.mimetype};base64,${file.buffer.toString('base64')}`,
                { 
                    folder: 'atlas-africa'
                }
            )
        return uploadResult;
    } catch (error) {
        logger('CLOUDINARY_UPLOAD').error(error);
        throw new Error('Failed to upload image to Cloudinary');
    }
}

async function deleteImage(publicId) {
    try {
        const result = await cloudinary.uploader.destroy(publicId);
        
        if (result.result !== 'ok') {
            logger('CLOUDINARY_DELETE').error(`Delete failed for ID: ${publicId}`, result);
        }
        
        return result;
    } catch (error) {
        logger('CLOUDINARY_DELETE').error(error);
        throw new Error('Failed to delete image from Cloudinary');
    }
}

module.exports = { uploadImage, deleteImage };