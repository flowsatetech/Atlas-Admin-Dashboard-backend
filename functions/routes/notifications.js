const express = require('express');
const router = express.Router();
const { NotificationService } = require('../services');
const { logger, serverError, clientError } = require('../helpers');

/**
 * @route   GET /api/notifications
 * @desc    Get user notifications
 * @access  Private
 */
router.get('/', async (req, res) => {
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
router.put('/read-all', async (req, res) => {
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
router.put('/:id/read', async (req, res) => {
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
