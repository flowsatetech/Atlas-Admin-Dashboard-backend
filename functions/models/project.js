const { z, baseEntityFields } = require("./common");

const projectStatusEnum = z.enum(["Planned", "InProgress", "OnHold", "Completed", "Cancelled"]);
const projectPriorityEnum = z.enum(["Low", "Medium", "High", "Urgent"]);

const projectSchema = z.object({
    ...baseEntityFields,
    name: z.string().min(1),
    clientId: z.string().min(1),
    description: z.string().default(""),
    deadline: z.number().int().nonnegative(),
    budget: z.number().nonnegative().default(0),
    recognizedRevenue: z.number().nonnegative().nullable().default(null),
    recognizedAt: z.number().int().nonnegative().nullable().default(null),
    priority: projectPriorityEnum.default("Medium"),
    status: projectStatusEnum.default("Planned"),
    teamIds: z.array(z.string().min(1)).default([]),
    progress: z.number().min(0).max(100).default(0),
    files: z.array(z.string().url()).default([])
});

const createProjectSchema = projectSchema.omit({
    createdAt: true,
    updatedAt: true
});

const updateProjectSchema = createProjectSchema.partial();

module.exports = {
    projectStatusEnum,
    projectPriorityEnum,
    projectSchema,
    createProjectSchema,
    updateProjectSchema
};
