import { Router } from 'express';
import { env } from '../../config/env.js';
import { validateRequest } from '../../shared/validation/index.js';
import { createAuthenticationMiddleware } from '../../middlewares/auth/authentication.middleware.js';
import { createCsrfMiddleware } from '../../middlewares/auth/csrf.middleware.js';
import { authController } from './auth.controller.js';
import {
  changePasswordBodySchema,
  forgotBodySchema,
  loginBodySchema,
  registerBodySchema,
  resetBodySchema
} from './auth.validation.js';

const router = Router();
const authenticate = createAuthenticationMiddleware({ cookieName: env.sessionCookieName });
const csrf = createCsrfMiddleware();
router.post('/register', validateRequest({ body: registerBodySchema }), authController.register);
router.post('/login', validateRequest({ body: loginBodySchema }), authController.login);
router.post(
  '/forgot-password',
  validateRequest({ body: forgotBodySchema }),
  authController.forgotPassword
);
router.post(
  '/reset-password',
  validateRequest({ body: resetBodySchema }),
  authController.resetPassword
);
router.get('/me', authenticate, authController.me);
router.get('/csrf', authenticate, authController.csrf);
router.post('/logout', authenticate, csrf, authController.logout);
router.post(
  '/change-password',
  authenticate,
  csrf,
  validateRequest({ body: changePasswordBodySchema }),
  authController.changePassword
);
export default router;
