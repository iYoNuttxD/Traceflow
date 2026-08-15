import express from 'express';
import { env } from './config/env.js';
import { createErrorHandler } from './middlewares/error-handler.middleware.js';
import { notFoundMiddleware } from './middlewares/not-found.middleware.js';
import { createRequestContextMiddleware } from './middlewares/request-context.middleware.js';
import routes from './routes/index.js';
import { authRoutes } from './modules/auth/index.js';
import { githubWebhookController } from './modules/github/github-app.controller.js';
import { githubAppCallbackRoutes } from './modules/github/github-public.routes.js';
import { createAuthenticationMiddleware } from './middlewares/auth/authentication.middleware.js';
import { createCsrfMiddleware } from './middlewares/auth/csrf.middleware.js';
import { createProjectAuthorizationMiddleware } from './middlewares/auth/project-authorization.middleware.js';
import { requireAccountState } from './middlewares/auth/account-state.middleware.js';
import { settingsPublicRoutes } from './modules/settings/index.js';
import { createHealthHandlers } from './shared/http/index.js';
import { logger as defaultLogger } from './shared/logger/index.js';
import {
  createCorsMiddleware,
  createRateLimiters,
  createSecurityHeadersMiddleware,
  createSensitiveAttemptLogger,
  noStoreApiResponses,
  requireJsonContentType
} from './shared/security/index.js';

export function createApp({ logger = defaultLogger, readinessCheck, securityConfig = env } = {}) {
  const app = express();
  const health = createHealthHandlers({ readinessCheck });
  const rateLimiters = createRateLimiters({ ...securityConfig, logger });
  const authenticate = createAuthenticationMiddleware({
    cookieName: securityConfig.sessionCookieName
  });
  const csrf = createCsrfMiddleware();

  app.disable('x-powered-by');
  app.set('trust proxy', securityConfig.trustProxy);
  app.use(createRequestContextMiddleware({ logger }));
  app.use(createSecurityHeadersMiddleware(securityConfig));
  app.use(createCorsMiddleware(securityConfig));
  app.use('/api', noStoreApiResponses);
  app.use('/api', rateLimiters.globalAbuse);
  app.use('/api/github-app/callback', githubAppCallbackRoutes);
  app.use('/api/settings/account/email-change/confirm', rateLimiters.authentication);
  app.use('/api/account/reactivation/confirm', rateLimiters.authentication);
  app.use('/api', settingsPublicRoutes);
  app.post(
    '/api/webhooks/github-app',
    express.raw({ type: 'application/json', limit: '1mb' }),
    githubWebhookController.handle
  );
  app.use(requireJsonContentType);
  app.use(express.json({ limit: securityConfig.bodyLimit, strict: true }));

  app.get('/health', health.health);
  app.get('/health/live', health.live);
  app.get('/health/ready', health.ready);
  app.use('/api/auth/register', rateLimiters.authentication, rateLimiters.emailDelivery);
  app.use('/api/auth/login', rateLimiters.authentication);
  app.use('/api/auth/github/start', rateLimiters.authentication);
  app.use('/api/auth/github/callback', rateLimiters.authentication);
  app.use('/api/auth/forgot-password', rateLimiters.authentication, rateLimiters.emailDelivery);
  app.use('/api/auth/reset-password', rateLimiters.authentication);
  app.use('/api/auth/email-verification/verify', rateLimiters.authentication);
  app.use('/api/auth/email-verification/resend', authenticate, csrf, rateLimiters.emailDelivery);
  app.use('/api/auth/username', authenticate, csrf, rateLimiters.sensitiveMutation);
  app.use('/api/auth/change-password', authenticate, csrf, rateLimiters.sensitiveMutation);
  app.use('/api/auth/github/reauth/start', authenticate, csrf, rateLimiters.sensitiveMutation);
  app.get(
    ['/api/auth/me', '/api/auth/csrf'],
    authenticate,
    rateLimiters.authenticatedReadBurst,
    rateLimiters.authenticatedReadSustained
  );
  app.use('/api/auth', authRoutes);
  app.use(
    '/api/projects/join',
    createSensitiveAttemptLogger({ logger, event: 'project_join' }),
    rateLimiters.join
  );
  app.use('/api', authenticate);
  app.get(
    [
      '/api/projects',
      '/api/settings/account',
      '/api/settings/account/email-change/status',
      '/api/settings/security/sessions',
      '/api/settings/privacy/deletion',
      '/api/settings/integrations/github',
      '/api/settings/integrations/github-identity',
      '/api/github/app/installations',
      '/api/github/app/installations/:installationId/repositories',
      '/api/projects/:projectId/github/sync/status',
      '/api/projects/:projectId/members',
      '/api/projects/:projectId/invitations'
    ],
    rateLimiters.authenticatedReadBurst,
    rateLimiters.authenticatedReadSustained
  );
  app.patch(
    ['/api/settings/account/profile', '/api/settings/account/username'],
    rateLimiters.sensitiveMutation
  );
  app.post(
    '/api/settings/account/email-change',
    rateLimiters.sensitiveMutation,
    rateLimiters.emailDelivery
  );
  app.delete('/api/settings/account/email-change', rateLimiters.sensitiveMutation);
  app.post(
    [
      '/api/settings/security/password',
      '/api/settings/security/password/initialize',
      '/api/settings/integrations/github-identity/link/start',
      '/api/settings/security/sessions/revoke-others',
      '/api/settings/account/deactivate',
      '/api/settings/privacy/deletion',
      '/api/github/app/installations/start',
      '/api/projects/from-github'
    ],
    rateLimiters.sensitiveMutation
  );
  app.delete(
    [
      '/api/settings/security/sessions/:sessionId',
      '/api/settings/privacy/deletion',
      '/api/settings/integrations/github/authorizations/:authorizationId',
      '/api/settings/integrations/github-identity'
    ],
    rateLimiters.sensitiveMutation
  );
  app.post(
    '/api/account/reactivation/start',
    rateLimiters.sensitiveMutation,
    rateLimiters.emailDelivery
  );
  app.post(
    ['/api/account/personal-data/export', '/api/settings/privacy/export'],
    rateLimiters.dataExport
  );
  app.post(
    [
      '/api/projects/invitations/details',
      '/api/projects/invitations/accept',
      '/api/projects/invitations/decline'
    ],
    createSensitiveAttemptLogger({ logger, event: 'project_invitation_response' }),
    rateLimiters.sensitiveMutation
  );
  app.post(
    '/api/projects/:projectId/invitations',
    createSensitiveAttemptLogger({ logger, event: 'project_invitation_create' }),
    rateLimiters.sensitiveMutation,
    rateLimiters.emailDelivery
  );
  app.patch('/api/projects/:projectId/members/:membershipId', rateLimiters.sensitiveMutation);
  app.delete(
    ['/api/projects/:projectId/members/me', '/api/projects/:projectId/members/:membershipId'],
    rateLimiters.sensitiveMutation
  );
  app.post(
    [
      '/api/projects/:projectId/members/:membershipId/reactivate',
      '/api/projects/:projectId/ownership/transfer'
    ],
    rateLimiters.sensitiveMutation
  );
  app.post(
    '/api/projects/:projectId/github/sync',
    createSensitiveAttemptLogger({ logger, event: 'github_sync' }),
    rateLimiters.sync
  );
  app.use('/api', csrf);
  app.use('/api', requireAccountState);
  app.use('/api', createProjectAuthorizationMiddleware());
  app.use('/api', routes);
  app.use(notFoundMiddleware);
  app.use(createErrorHandler({ logger }));

  return app;
}

const app = createApp();

export default app;
