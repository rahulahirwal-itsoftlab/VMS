import asyncHandler from '../../middleware/asyncHandler.middleware.js';
import notificationService from './notification.service.js';

class NotificationController {
  /**
   * @desc    Get logged-in user's notifications
   * @route   GET /api/v1/notifications
   * @access  Private (All roles)
   * @query   isRead (true/false), page, limit
   */
  getMyNotifications = asyncHandler(async (req, res) => {
    notificationService.checkAndNotifyInstallments().catch(() => {});
    const result = await notificationService.getMyNotifications(req.user.id, req.query);
    res.status(200).json({
      success: true,
      message: 'Notifications retrieved successfully.',
      ...result,
    });
  });

  getUnreadCount = asyncHandler(async (req, res) => {
    const result = await notificationService.getUnreadCount(req.user.id);
    res.status(200).json({
      success: true,
      message: 'Unread notification count retrieved successfully.',
      ...result,
    });
  });

  getNotificationById = asyncHandler(async (req, res) => {
    const notification = await notificationService.getById(req.params.id, req.user.id);
    res.status(200).json({
      success: true,
      message: 'Notification retrieved successfully.',
      data: notification,
      notification,
    });
  });

  /**
   * @desc    Mark a single notification as read
   * @route   PATCH /api/v1/notifications/:id/read
   * @access  Private (All roles)
   */
  markAsRead = asyncHandler(async (req, res) => {
    const result = await notificationService.markAsRead(req.params.id, req.user.id);
    res.status(200).json({ success: true, ...result });
  });

  /**
   * @desc    Mark all notifications as read
   * @route   PATCH /api/v1/notifications/read-all
   * @access  Private (All roles)
   */
  markAllAsRead = asyncHandler(async (req, res) => {
    const result = await notificationService.markAllAsRead(req.user.id);
    res.status(200).json({ success: true, ...result });
  });

  deleteNotification = asyncHandler(async (req, res) => {
    const result = await notificationService.deleteNotification(req.params.id, req.user.id);
    res.status(200).json({ success: true, ...result });
  });
}

export default new NotificationController();
