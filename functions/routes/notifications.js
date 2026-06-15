const express = require('express');
const router = express.Router();
const middlewares = require('../middlewares');
const { NotificationService } = require('../services');
const { logger, serverError, clientError } = require('../helpers');

const { notificationsRead, notificationsWrite } = middlewares.rateLimiters;

/**
 * @route   GET /api/notifications/preferences
 * @desc    Get current user's notification preferences
 * @access  Private
 */
router.get('/preferences', notificationsRead, async (req, res) => {
  try {
    const userId = req.user?.userId || req.db_user?.userId;
    if (!userId) return clientError(res, 401, 'Authentication required');

    const preferences = await NotificationService.getUserPreferences(userId);

    return res.status(200).json({
      success: true,
      message: 'Notification preferences fetched successfully',
      data: { preferences },
    });
  } catch (error) {
    logger('GET_NOTIFICATION_PREFERENCES').error(error);
    return serverError(res, error, 'Failed to fetch notification preferences.');
  }
});

/**
 * @route   PUT /api/notifications/preferences
 * @desc    Update current user's notification preferences
 * @access  Private
 */
router.put('/preferences', notificationsWrite, async (req, res) => {
  try {
    const userId = req.user?.userId || req.db_user?.userId;
    if (!userId) return clientError(res, 401, 'Authentication required');

    const preferences = await NotificationService.updateUserPreferences(userId, req.body || {});

    return res.status(200).json({
      success: true,
      message: 'Notification preferences updated successfully',
      data: { preferences },
    });
  } catch (error) {
    logger('UPDATE_NOTIFICATION_PREFERENCES').error(error);
    if (error.statusCode === 400) return clientError(res, 400, error.message, error.details);
    return serverError(res, error, 'Failed to update notification preferences.');
  }
});

/**
 * @route   GET /api/notifications
 * @desc    Get user notifications
 * @access  Private
 */
router.get('/', notificationsRead, async (req, res) => {
  try {
    const userId = req.user?.userId || req.db_user?.userId;
    if (!userId) return clientError(res, 401, 'Authentication required');

    const { page, limit, unreadOnly } = req.query;

    const result = await NotificationService.getUserNotifications(userId, {
      page,
      limit,
      unreadOnly
    });

    return res.status(200).json({
      success: true,
      message: 'Notifications fetched successfully',
      data: result,
    });
  } catch (error) {
    logger('GET_NOTIFICATIONS').error(error);
    return serverError(res, error, 'Failed to fetch notifications.');
  }
});

/**
 * @route   PUT /api/notifications/read-all
 * @desc    Mark all user notifications as read
 * @access  Private
 */
router.put('/read-all', notificationsWrite, async (req, res) => {
  try {
    const userId = req.user?.userId || req.db_user?.userId;
    if (!userId) return clientError(res, 401, 'Authentication required');

    const modifiedCount = await NotificationService.markAllAsRead(userId);

    return res.status(200).json({
      success: true,
      message: `Successfully marked ${modifiedCount} notifications as read.`,
      data: { modifiedCount },
    });
  } catch (error) {
    logger('READ_ALL_NOTIFICATIONS').error(error);
    return serverError(res, error, 'Failed to mark notifications as read.');
  }
});

/**
 * @route   PUT /api/notifications/:id/read
 * @desc    Mark a specific notification as read
 * @access  Private
 */
router.put('/:id/read', notificationsWrite, async (req, res) => {
  try {
    const notificationId = req.params.id;
    const userId = req.user?.userId || req.db_user?.userId;
    if (!userId) return clientError(res, 401, 'Authentication required');

    const notification = await NotificationService.markAsRead(notificationId, userId);

    if (!notification) {
      return clientError(res, 404, 'Notification not found');
    }

    return res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      data: { notification },
    });
  } catch (error) {
    logger('READ_NOTIFICATION').error(error);
    return serverError(res, error, 'Failed to mark notification as read.');
  }
});

module.exports = router;
