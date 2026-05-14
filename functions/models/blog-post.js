const { z, baseEntityFields } = require("./common");

const blogPostStatusEnum = z.enum(["draft", "published", "scheduled"]);

const blogPostCategoryEnum = z.enum([
    "Marketing",
    "SEO",
    "Branding",
    "Social Media",
    "Content Marketing",
    "Email Marketing",
    "Other"
]);

const blogPostSchema = z.object({
    ...baseEntityFields,
    title: z.string().min(1),
    slug: z.string().min(1),
    excerpt: z.string().min(1),
    content: z.string().default(""),
    category: blogPostCategoryEnum,
    authorId: z.string().min(1),
    tags: z.array(z.string().min(1)).default([]),
    status: blogPostStatusEnum.default("draft"),
    isFeatured: z.boolean().default(false),
    views: z.number().int().nonnegative().default(0),
    publishedAt: z.number().int().nonnegative().nullable().default(null),
    scheduledAt: z.number().int().nonnegative().nullable().default(null),
});

const createBlogPostSchema = blogPostSchema.omit({
    createdAt: true,
    updatedAt: true,
    views: true,
});

const updateBlogPostSchema = createBlogPostSchema.omit({ id: true }).partial();

module.exports = {
    blogPostStatusEnum,
    blogPostCategoryEnum,
    blogPostSchema,
    createBlogPostSchema,
    updateBlogPostSchema,
};
