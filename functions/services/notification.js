const db = require('../db');
const { logger, generateToken } = require('../helpers');
const {
  createNotificationSchema,
  updateNotificationPreferencesSchema,
  normalizeNotificationPreferences,
} = require('../models/notification');

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
      };
    });

    const preferences = await this.getPreferences();
    const enabledNotificationItems = notificationItems.filter((item) => preferences[item.type] !== false);

    if (enabledNotificationItems.length === 0) return [];

    return db.addNotifications(enabledNotificationItems);
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

  static async getPreferences() {
    const preferences = await db.getGlobalNotificationPreferences();
    return normalizeNotificationPreferences(preferences);
  }

  static async updatePreferences(preferencesUpdate) {
    const parsed = updateNotificationPreferencesSchema.safeParse(preferencesUpdate);
    if (!parsed.success) {
      const error = new Error('Invalid notification preferences');
      error.statusCode = 400;
      error.details = parsed.error.issues;
      throw error;
    }

    const currentPreferences = await this.getPreferences();
    const notificationPreferences = normalizeNotificationPreferences({
      ...currentPreferences,
      ...parsed.data,
    });
    const updated = await db.updateGlobalNotificationPreferences(notificationPreferences);

    return normalizeNotificationPreferences(updated?.notificationPreferences);
  }

  static async markAsRead(notificationId, userId) {
    return db.markNotificationAsRead(notificationId, userId);
  }

  static async markAllAsRead(userId) {
    return db.markAllNotificationsAsRead(userId);
  }
}

module.exports = NotificationService;
