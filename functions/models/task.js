const { z, baseEntityFields } = require("./common");

const taskStatusEnum = z.enum(["Todo", "InProgress", "Review", "Done", "Blocked"]);

const taskSchema = z.object({
    ...baseEntityFields,
    title: z.string().min(1),
    description: z.string().default(""),
    projectId: z.string().min(1).nullable().default(null),
    assigneeId: z.string().min(1),
    dueDate: z.number().int().nonnegative(),
    status: taskStatusEnum.default("Todo")
});

const createTaskSchema = taskSchema.omit({
    createdAt: true,
    updatedAt: true
});

const updateTaskSchema = createTaskSchema.partial();

module.exports = {
    taskStatusEnum,
    taskSchema,
    createTaskSchema,
    updateTaskSchema
};
