const { z, baseEntityFields } = require("./common");

const clientStatusEnum = z.enum(["Lead", "Active", "Inactive", "Archived"]);

const clientSchema = z.object({
    ...baseEntityFields,
    fullName: z.string().min(1),
    companyName: z.string().min(1),
    email: z.email(),
    phone: z.string().min(3),
    status: clientStatusEnum.default("Lead"),
    tags: z.array(z.string().min(1)).default([]),
    assignedStaffId: z.string().min(1).nullable().default(null),
    leadSource: z.string().min(1).nullable().default(null),
    notes: z.string().default(""),
    projectsCount: z.number().int().nonnegative().default(0)
});

const createClientSchema = clientSchema.omit({
    createdAt: true,
    updatedAt: true
});

const updateClientSchema = createClientSchema.partial();

module.exports = {
    clientStatusEnum,
    clientSchema,
    createClientSchema,
    updateClientSchema
};
