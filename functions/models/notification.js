const { z, baseEntityFields } = require("./common");

const notificationTypeEnum = z.enum([
  'TASK_ASSIGNMENT',
  'PROJECT_ASSIGNMENT',
  'CLIENT_ASSIGNMENT',
  'LEAD_ASSIGNMENT',
  'COMMENT_MENTION',
  'ROLE_CHANGE',
  'SYSTEM_ALERT',
  'CLIENT_CREATED',
  'PROJECT_STATUS_CHANGE',
  'LEAD_STATUS_CHANGE',
  'PROJECT_COMMENT',
  'PASSWORD_UPDATED'
]);

const notificationSchema = z.object({
  ...baseEntityFields,
  recipientId: z.string().min(1),
  type: notificationTypeEnum,
  title: z.string().min(1),
  message: z.string().min(1),
  link: z.string().optional(),
  referenceId: z.string().optional(),
  referenceType: z.string().optional(),
  isRead: z.boolean().default(false),
  createdBy: z.string().optional()
});

const createNotificationSchema = notificationSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  isRead: true
}).extend({
  isRead: z.boolean().optional()
});

module.exports = {
  notificationTypeEnum,
  notificationSchema,
  createNotificationSchema
};
