import { Router } from 'express';
import { env } from '../../config/env.js';
import { validateRequest } from '../../shared/validation/index.js';
import { createAuthenticationMiddleware } from '../../middlewares/auth/authentication.middleware.js';
import { createCsrfMiddleware } from '../../middlewares/auth/csrf.middleware.js';
import { authController } from './auth.controller.js';
import { githubAuthController } from './github-auth.controller.js';
import {
  changePasswordBodySchema,
  forgotBodySchema,
  loginBodySchema,
  registerBodySchema,
  resetBodySchema,
  verifyEmailBodySchema,
  emptyAuthBodySchema,
  usernameBodySchema,
  githubLoginStartBodySchema
} from './auth.validation.js';

const router = Router();
const authenticate = createAuthenticationMiddleware({ cookieName: env.sessionCookieName });
const csrf = createCsrfMiddleware();
router.post('/register', validateRequest({ body: registerBodySchema }), authController.register);
router.post('/login', validateRequest({ body: loginBodySchema }), authController.login);
router.post(
  '/github/start',
  validateRequest({ body: githubLoginStartBodySchema }),
  githubAuthController.startLogin
);
router.get('/github/callback', githubAuthController.callback);
router.post(
  '/github/reauth/start',
  authenticate,
  csrf,
  validateRequest({ body: emptyAuthBodySchema }),
  githubAuthController.startPasswordReauthentication
);
router.post(
  '/forgot-password',
  validateRequest({ body: forgotBodySchema }),
  authController.forgotPassword
);
router.patch(
  '/username',
  authenticate,
  csrf,
  validateRequest({ body: usernameBodySchema }),
  authController.updateUsername
);
router.post(
  '/email-verification/verify',
  validateRequest({ body: verifyEmailBodySchema }),
  authController.verifyEmail
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
  '/email-verification/resend',
  authenticate,
  csrf,
  validateRequest({ body: emptyAuthBodySchema }),
  authController.resendEmailVerification
);
router.post(
  '/change-password',
  authenticate,
  csrf,
  validateRequest({ body: changePasswordBodySchema }),
  authController.changePassword
);
export default router;
