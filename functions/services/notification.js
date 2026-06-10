const db = require('../db');
const { logger, generateToken } = require('../helpers');
const { createNotificationSchema } = require('../models/notification');

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

    return db.addNotifications(notificationItems);
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

  static async markAsRead(notificationId, userId) {
    return db.markNotificationAsRead(notificationId, userId);
  }

  static async markAllAsRead(userId) {
    return db.markAllNotificationsAsRead(userId);
  }
}

module.exports = NotificationService;
