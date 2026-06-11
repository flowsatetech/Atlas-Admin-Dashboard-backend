const { z, baseEntityFields } = require("./common");

const notificationTypes = [
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
];

const notificationTypeEnum = z.enum(notificationTypes);

const notificationPreferencesShape = notificationTypes.reduce((shape, type) => {
  shape[type] = z.boolean();
  return shape;
}, {});

const notificationPreferencesSchema = z.object(notificationPreferencesShape);
const updateNotificationPreferencesSchema = notificationPreferencesSchema.partial().strict();
const defaultNotificationPreferences = Object.freeze(
  notificationTypes.reduce((preferences, type) => {
    preferences[type] = true;
    return preferences;
  }, {})
);

const normalizeNotificationPreferences = (preferences = {}) => ({
  ...defaultNotificationPreferences,
  ...notificationPreferencesSchema.partial().parse(preferences || {})
});

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
  notificationTypes,
  notificationTypeEnum,
  notificationSchema,
  createNotificationSchema,
  notificationPreferencesSchema,
  updateNotificationPreferencesSchema,
  defaultNotificationPreferences,
  normalizeNotificationPreferences
};
