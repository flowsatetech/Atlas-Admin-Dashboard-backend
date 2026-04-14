const { z, baseEntityFields } = require("./common");

const cmsPageStatusEnum = z.enum(["Draft", "Published", "Archived"]);

const cmsPageSchema = z.object({
    ...baseEntityFields,
    slug: z.string().min(1),
    title: z.string().min(1),
    content: z.string(),
    status: cmsPageStatusEnum.default("Draft"),
    lastEditedBy: z.string().min(1).nullable().default(null),
    publishedAt: z.number().int().nonnegative().nullable().default(null)
});

const createCmsPageSchema = cmsPageSchema.omit({
    createdAt: true,
    updatedAt: true
});

const updateCmsPageContentSchema = z.object({
    content: z.string(),
    status: cmsPageStatusEnum.optional()
});

module.exports = {
    cmsPageStatusEnum,
    cmsPageSchema,
    createCmsPageSchema,
    updateCmsPageContentSchema
};
