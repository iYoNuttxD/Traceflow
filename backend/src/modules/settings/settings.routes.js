import { Router } from 'express';
import { validateRequest } from '../../shared/validation/index.js';
import { settingsController } from './settings.controller.js';
import {
  emailChangeBody,
  githubAuthorizationParams,
  passwordChangeBody,
  passwordConfirmationBody,
  profileBody,
  reactivationStartBody,
  sessionParams,
  usernameBody,
  githubIdentityLinkBody,
  passwordInitializeBody
} from './settings.validation.js';

const router = Router();

router.get('/settings/account', settingsController.account);
router.patch(
  '/settings/account/profile',
  validateRequest({ body: profileBody }),
  settingsController.profile
);
router.patch(
  '/settings/account/username',
  validateRequest({ body: usernameBody }),
  settingsController.username
);
router.post(
  '/settings/account/email-change',
  validateRequest({ body: emailChangeBody }),
  settingsController.requestEmail
);
router.get('/settings/account/email-change/status', settingsController.emailStatus);
router.delete('/settings/account/email-change', settingsController.cancelEmail);
router.post(
  '/settings/security/password',
  validateRequest({ body: passwordChangeBody }),
  settingsController.password
);
router.get('/settings/security/sessions', settingsController.sessions);
router.delete(
  '/settings/security/sessions/:sessionId',
  validateRequest({ params: sessionParams }),
  settingsController.revokeSession
);
router.post('/settings/security/sessions/revoke-others', settingsController.revokeOthers);
router.post(
  '/settings/account/deactivate',
  validateRequest({ body: passwordConfirmationBody }),
  settingsController.deactivate
);
router.post(
  '/account/reactivation/start',
  validateRequest({ body: reactivationStartBody }),
  settingsController.startReactivation
);
router.get('/settings/privacy/deletion', settingsController.deletion);
router.post(
  '/settings/privacy/deletion',
  validateRequest({ body: passwordConfirmationBody }),
  settingsController.requestDeletion
);
router.delete(
  '/settings/privacy/deletion',
  validateRequest({ body: passwordConfirmationBody }),
  settingsController.cancelDeletion
);
router.post('/settings/privacy/export', settingsController.exportData);
router.get('/settings/integrations/github', settingsController.github);
router.get('/settings/integrations/github-identity', settingsController.githubIdentity);
router.post(
  '/settings/integrations/github-identity/link/start',
  validateRequest({ body: githubIdentityLinkBody }),
  settingsController.startGithubIdentityLink
);
router.delete(
  '/settings/integrations/github-identity',
  validateRequest({ body: passwordConfirmationBody }),
  settingsController.unlinkGithubIdentity
);
router.post(
  '/settings/security/password/initialize',
  validateRequest({ body: passwordInitializeBody }),
  settingsController.initializePassword
);
router.delete(
  '/settings/integrations/github/authorizations/:authorizationId',
  validateRequest({ params: githubAuthorizationParams, body: passwordConfirmationBody }),
  settingsController.removeGithub
);

export default router;
