const { z, baseEntityFields } = require("./common");

const commentSchema = z.object({
    ...baseEntityFields,
    projectId: z.string().min(1),
    authorId: z.string().min(1),
    content: z.string().min(1)
});

const createCommentSchema = commentSchema.omit({
    createdAt: true,
    updatedAt: true
});

const updateCommentSchema = z.object({
    content: z.string().min(1)
});

module.exports = {
    commentSchema,
    createCommentSchema,
    updateCommentSchema
};
