const { z, baseEntityFields, paginationQuerySchema } = require("./common");

const taskStatusEnum = z.enum(["Todo", "InProgress", "Review", "Done", "Blocked"]);
const taskPriorityEnum = z.enum(["low", "medium", "high"]);

const taskSchema = z.object({
    ...baseEntityFields,
    title: z.string().min(1),
    description: z.string().default(""),
    projectId: z.string().min(1).nullable().default(null),
    assigneeId: z.string().min(1),
    dueDate: z.number().int().nonnegative(),
    status: taskStatusEnum.default("Todo"),
    priority: taskPriorityEnum.default("medium"),
});

const createTaskSchema = z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    assigneeId: z.string().min(1).optional(),
    assignedTo: z.string().min(1).optional(),
    dueDate: z.number().int().nonnegative().optional(),
    status: taskStatusEnum.default("Todo"),
    projectId: z.string().min(1).optional(),
    priority: taskPriorityEnum.optional(),
});

const updateTaskSchema = createTaskSchema.partial();

const listTasksQuerySchema = paginationQuerySchema.extend({
    status: taskStatusEnum.optional(),
    assigneeId: z.string().min(1).optional(),
    assignedTo: z.string().min(1).optional(),
    projectId: z.string().min(1).optional(),
}).extend({ limit: z.coerce.number().int().min(1).max(100).default(20) });

module.exports = {
    taskStatusEnum,
    taskPriorityEnum,
    taskSchema,
    createTaskSchema,
    updateTaskSchema,
    listTasksQuerySchema,
};
