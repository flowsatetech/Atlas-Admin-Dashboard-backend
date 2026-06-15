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
  'PASSWORD_UPDATED',
  'NEW_LOGIN_DETECTED'
];

const notificationTypeEnum = z.enum(notificationTypes);

const channelPreferencesSchema = z.object({
  inApp: z.boolean().default(true),
  email: z.boolean().default(true),
});

const notificationPreferencesShape = notificationTypes.reduce((shape, type) => {
  shape[type] = channelPreferencesSchema;
  return shape;
}, {});

const notificationPreferencesSchema = z.object(notificationPreferencesShape);
const updateNotificationPreferencesSchema = notificationPreferencesSchema.partial().strict();
const getDefaultChannelPreferences = () => ({ inApp: true, email: true });

const defaultNotificationPreferences = Object.freeze(
  notificationTypes.reduce((preferences, type) => {
    preferences[type] = getDefaultChannelPreferences();
    return preferences;
  }, {})
);

const normalizeNotificationPreferences = (preferences = {}) => {
  const raw = preferences || {};

  return Object.freeze(
    notificationTypes.reduce((normalized, type) => {
      const existing = raw[type];

      if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
        normalized[type] = {
          inApp: typeof existing.inApp === 'boolean' ? existing.inApp : true,
          email: typeof existing.email === 'boolean' ? existing.email : true,
        };
      } else if (existing === true || existing === false) {
        normalized[type] = {
          inApp: true,
          email: existing,
        };
      } else {
        normalized[type] = { inApp: true, email: true };
      }
      return normalized;
    }, {})
  );
};

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
