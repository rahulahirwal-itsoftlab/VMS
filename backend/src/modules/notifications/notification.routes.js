import express from 'express';
import { protect } from '../../middleware/auth.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import notificationController from './notification.controller.js';
import { ROLES } from '../../zodSchema/index.js';

const router = express.Router();

const ALL_ROLES = Object.values(ROLES);

router.use(protect);

/**
 * GET    /api/v1/notifications           — Get my notifications
 */
router.get('/', authorize(ALL_ROLES), notificationController.getMyNotifications);

router.get('/unread-count', authorize(ALL_ROLES), notificationController.getUnreadCount);

/**
 * PATCH  /api/v1/notifications/read-all  — Mark all as read (must be before /:id)
 */
router.patch('/read-all', authorize(ALL_ROLES), notificationController.markAllAsRead);

/**
 * PATCH  /api/v1/notifications/:id/read  — Mark one as read
 */
router.patch('/:id/read', authorize(ALL_ROLES), notificationController.markAsRead);

router.get('/:id', authorize(ALL_ROLES), notificationController.getNotificationById);

router.delete('/:id', authorize(ALL_ROLES), notificationController.deleteNotification);

export default router;
