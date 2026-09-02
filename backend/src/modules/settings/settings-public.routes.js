import { Router } from 'express';
import { validateRequest } from '../../shared/validation/index.js';
import { settingsController } from './settings.controller.js';
import { tokenQuery } from './settings.validation.js';

const router = Router();
router.get(
  '/settings/account/email-change/confirm',
  validateRequest({ query: tokenQuery }),
  settingsController.confirmEmail
);
router.get(
  '/account/reactivation/confirm',
  validateRequest({ query: tokenQuery }),
  settingsController.confirmReactivation
);
export default router;
