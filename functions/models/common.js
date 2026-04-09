const { z } = require("zod");

const baseEntityFields = {
    id: z.string().min(1),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative()
};

const paginationQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10)
});

module.exports = {
    z,
    baseEntityFields,
    paginationQuerySchema
};
