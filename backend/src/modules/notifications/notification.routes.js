import { Router } from 'express';
import { validateRequest } from '../../shared/validation/index.js';
import { notificationController } from './notification.controller.js';
import {
  emptyNotificationBodySchema,
  emptyQuerySchema,
  notificationListQuerySchema,
  notificationParamsSchema,
  notificationPreferencesBodySchema,
  notificationReadBodySchema
} from './notification.validation.js';

const router = Router();

router.get(
  '/notifications',
  validateRequest({ query: notificationListQuerySchema }),
  notificationController.list
);
router.get(
  '/notifications/unread-count',
  validateRequest({ query: emptyQuerySchema }),
  notificationController.unreadCount
);
router.post(
  '/notifications/read-all',
  validateRequest({ query: emptyQuerySchema, body: emptyNotificationBodySchema }),
  notificationController.markAllRead
);
router.patch(
  '/notifications/:notificationId',
  validateRequest({
    params: notificationParamsSchema,
    query: emptyQuerySchema,
    body: notificationReadBodySchema
  }),
  notificationController.markRead
);
router.get(
  '/settings/notifications',
  validateRequest({ query: emptyQuerySchema }),
  notificationController.preferences
);
router.put(
  '/settings/notifications',
  validateRequest({ query: emptyQuerySchema, body: notificationPreferencesBodySchema }),
  notificationController.updatePreferences
);

export default router;
