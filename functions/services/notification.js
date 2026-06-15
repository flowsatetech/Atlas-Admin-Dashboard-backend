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

    const uniqueRecipientIds = [...new Set(notificationItems.map((item) => item.recipientId))];
    const userPreferenceMap = await db.getUserNotificationPreferencesMap(uniqueRecipientIds);

    const enabledNotificationItems = notificationItems.filter((item) => {
      const userPreferences = userPreferenceMap[item.recipientId] || {};

      if (userPreferences.hasOwnProperty(item.type)) {
        return userPreferences[item.type] !== false;
      }

      return true;
    });

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
