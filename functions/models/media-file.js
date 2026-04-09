const { z, baseEntityFields } = require("./common");

const mediaTypeEnum = z.enum(["image", "document", "video", "other"]);

const mediaFileSchema = z.object({
    ...baseEntityFields,
    fileName: z.string().min(1),
    type: mediaTypeEnum.default("other"),
    mimeType: z.string().min(1),
    sizeBytes: z.number().int().nonnegative(),
    storageProvider: z.enum(["cloudinary", "local", "s3", "other"]).default("cloudinary"),
    publicId: z.string().min(1).nullable().default(null),
    url: z.string().url(),
    uploadedBy: z.string().min(1).nullable().default(null)
});

const createMediaFileSchema = mediaFileSchema.omit({
    createdAt: true,
    updatedAt: true
});

const updateMediaFileSchema = createMediaFileSchema.partial();

module.exports = {
    mediaTypeEnum,
    mediaFileSchema,
    createMediaFileSchema,
    updateMediaFileSchema
};
