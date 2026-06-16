const db = require('../db');
const { logger, generateToken } = require('../helpers');
const {
  createNotificationSchema,
  updateNotificationPreferencesSchema,
  normalizeNotificationPreferences,
  notificationTypes,
} = require('../models/notification');
const EmailService = require('./email');

function getChannelPreferences(userPreferences, type) {
  const pref = userPreferences[type];
  if (pref === true || pref === false) {
    return { inApp: true, email: pref };
  }
  if (pref && typeof pref === 'object') {
    return {
      inApp: typeof pref.inApp === 'boolean' ? pref.inApp : true,
      email: typeof pref.email === 'boolean' ? pref.email : true,
    };
  }
  return { inApp: true, email: true };
}

class NotificationService {
  static async createNotification(data) {
    const [notification] = await this.createNotifications([data]);
    return notification;
  }

  static async createNotifications(items = []) {
    if (!Array.isArray(items) || items.length === 0) return [];

    const now = Date.now();
    const notificationItems = items.map((item) => {
      const parsed = createNotificationSchema.safeParse(item);
      if (!parsed.success) {
        const error = new Error('Invalid notification data');
        error.details = parsed.error.issues;
        throw error;
      }

      return {
        id: generateToken(),
        ...parsed.data,
        isRead: parsed.data.isRead || false,
        createdAt: now,
        updatedAt: now,
        _emailContext: item._emailContext || {},
      };
    });

    const uniqueRecipientIds = [...new Set(notificationItems.map((item) => item.recipientId))];
    const userPreferenceMap = await db.getUserNotificationPreferencesMap(uniqueRecipientIds);
    const normalizedPrefMap = {};
    for (const userId of uniqueRecipientIds) {
      const rawPrefs = userPreferenceMap[userId] || {};
      normalizedPrefMap[userId] = normalizeNotificationPreferences(rawPrefs);
    }

    const inAppNotifications = [];
    const emailNotifications = [];

    for (const item of notificationItems) {
      const userPrefs = normalizedPrefMap[item.recipientId] || {};
      const channels = getChannelPreferences(userPrefs, item.type);

      if (channels.inApp) {
        inAppNotifications.push(item);
      }

      if (channels.email) {
        emailNotifications.push(item);
      }
    }

    let savedNotifications = [];
    if (inAppNotifications.length > 0) {
      savedNotifications = await db.addNotifications(inAppNotifications);
    }

    if (emailNotifications.length > 0) {
      this._sendEmailNotifications(emailNotifications, normalizedPrefMap).catch((error) => {
        logger('NOTIFICATION').error('Failed to send email notifications:', error);
      });
    }

    if (inAppNotifications.length > 0 && emailNotifications.length > 0) {
      return savedNotifications;
    }

    if (inAppNotifications.length > 0) {
      return savedNotifications;
    }

    return [];
  }

  static async _sendEmailNotifications(items, prefMap) {
    const userIds = [...new Set(items.map((item) => item.recipientId))];
    const users = await db.getUsersByIds(userIds);
    const userMap = {};
    for (const user of users) {
      userMap[user.userId] = user;
    }

    const emailJobs = [];
    for (const item of items) {
      const user = userMap[item.recipientId];
      if (!user || !user.email) continue;

      const templateVariables = {
        ...this._buildEmailTemplateVariables(item),
        ...(item._emailContext || {}),
      };
      emailJobs.push({ user, notification: item, templateVariables });
    }

    if (emailJobs.length > 0) {
      await EmailService.sendNotificationEmails(emailJobs);
    }
  }

  static _buildEmailTemplateVariables(notification) {
    const variables = {};
    const message = notification.message || '';
    const title = notification.title || '';

    variables.TASK_TITLE = title;
    variables.TASK_DESCRIPTION = message;
    variables.PROJECT_NAME = '';
    variables.PROJECT_STATUS = '';
    variables.PROJECT_PROGRESS = '';
    variables.LEAD_NAME = title;
    variables.LEAD_STATUS = '';
    variables.LEAD_STAGE = '';
    variables.NEW_ROLE = '';

    if (notification.link) {
      variables.DASHBOARD_URL = process.env.APP_BASE_URL
        ? (() => {
            try {
              const urls = JSON.parse(process.env.APP_BASE_URL);
              return Array.isArray(urls) && urls.length > 0 ? urls[0] : 'http://localhost:3000';
            } catch {
              return 'http://localhost:3000';
            }
          })()
        : 'http://localhost:3000';
    }

    return variables;
  }

  static dispatch(data, logScope = 'NOTIFICATION') {
    return this.createNotification(data).catch((error) => {
      logger(logScope).error('Failed to create notification:');
      logger(logScope).error(error);
      return null;
    });
  }

  static dispatchMany(items, logScope = 'NOTIFICATION') {
    return this.createNotifications(items).catch((error) => {
      logger(logScope).error('Failed to create notifications:');
      logger(logScope).error(error);
      return [];
    });
  }

  static async getUserNotifications(userId, options = {}) {
    return db.getNotificationsByRecipient(userId, options);
  }

  static async getUserPreferences(userId) {
    const user = await db.getUserById(userId);
    const userPreferences = user?.notificationPreferences || {};

    return normalizeNotificationPreferences({
      ...userPreferences,
    });
  }

  static async updateUserPreferences(userId, preferencesUpdate) {
    const parsed = updateNotificationPreferencesSchema.safeParse(preferencesUpdate);
    if (!parsed.success) {
      const error = new Error('Invalid notification preferences');
      error.statusCode = 400;
      error.details = parsed.error.issues;
      throw error;
    }

    const user = await db.getUserById(userId);
    const currentUserPreferences = user?.notificationPreferences || {};

    const notificationPreferences = normalizeNotificationPreferences({
      ...currentUserPreferences,
      ...parsed.data,
    });

    await db.updateUserNotificationPreferences(userId, notificationPreferences);
    return this.getUserPreferences(userId);
  }

  static async markAsRead(notificationId, userId) {
    return db.markNotificationAsRead(notificationId, userId);
  }

  static async markAllAsRead(userId) {
    return db.markAllNotificationsAsRead(userId);
  }
}

module.exports = NotificationService;