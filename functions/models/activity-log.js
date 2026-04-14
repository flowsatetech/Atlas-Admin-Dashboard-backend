const { z, baseEntityFields } = require("./common");

const activityTypeEnum = z.enum([
    "client.created",
    "project.created",
    "project.updated",
    "project.comment.created",
    "task.created",
    "task.updated",
    "cms.updated",
    "media.uploaded",
    "auth.login",
    "auth.logout"
]);

const activityLogSchema = z.object({
    ...baseEntityFields,
    type: activityTypeEnum,
    actorId: z.string().min(1).nullable().default(null),
    entityId: z.string().min(1).nullable().default(null),
    entityType: z.string().min(1).nullable().default(null),
    message: z.string().min(1),
    meta: z.record(z.string(), z.unknown()).default({})
});

const createActivityLogSchema = activityLogSchema.omit({
    createdAt: true,
    updatedAt: true
});

module.exports = {
    activityTypeEnum,
    activityLogSchema,
    createActivityLogSchema
};
