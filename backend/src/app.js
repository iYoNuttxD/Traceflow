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
  const rateLimiters = createRateLimiters({
    windowMs: securityConfig.rateLimitWindowMs,
    generalMax: securityConfig.rateLimitMax,
    sensitiveMax: securityConfig.sensitiveRateLimitMax
  });

  app.disable('x-powered-by');
  app.set('trust proxy', securityConfig.trustProxy);
  app.use(createRequestContextMiddleware({ logger }));
  app.use(createSecurityHeadersMiddleware(securityConfig));
  app.use(createCorsMiddleware(securityConfig));
  app.use('/api', noStoreApiResponses);
  app.use('/api/github-app/callback', rateLimiters.general, githubAppCallbackRoutes);
  app.use('/api/settings/account/email-change/confirm', rateLimiters.sensitive);
  app.use('/api/account/reactivation/confirm', rateLimiters.sensitive);
  app.use('/api', settingsPublicRoutes);
  app.post(
    '/api/webhooks/github-app',
    rateLimiters.general,
    express.raw({ type: 'application/json', limit: '1mb' }),
    githubWebhookController.handle
  );
  app.use(requireJsonContentType);
  app.use(express.json({ limit: securityConfig.bodyLimit, strict: true }));

  app.get('/health', health.health);
  app.get('/health/live', health.live);
  app.get('/health/ready', health.ready);
  app.use('/api/auth/register', rateLimiters.sensitive);
  app.use('/api/auth/login', rateLimiters.sensitive);
  app.use('/api/auth/forgot-password', rateLimiters.sensitive);
  app.use('/api/auth/reset-password', rateLimiters.sensitive);
  app.use('/api/auth/email-verification', rateLimiters.sensitive);
  app.use('/api/auth', authRoutes);
  app.use(
    '/api/projects/join',
    createSensitiveAttemptLogger({ logger, event: 'project_join' }),
    rateLimiters.join
  );
  app.use('/api/github/app/installations', rateLimiters.sensitive);
  app.use('/api/projects/from-github', rateLimiters.sensitive);
  app.use('/api/account/personal-data/export', rateLimiters.sensitive);
  app.use('/api/settings/account/email-change', rateLimiters.sensitive);
  app.use('/api/settings/security/password', rateLimiters.sensitive);
  app.use('/api/settings/privacy', rateLimiters.sensitive);
  app.use('/api/settings/integrations', rateLimiters.sensitive);
  app.use('/api/account/reactivation', rateLimiters.sensitive);
  app.use(
    '/api/projects/:projectId/github/sync',
    createSensitiveAttemptLogger({ logger, event: 'github_sync' }),
    rateLimiters.sync
  );
  app.use('/api', rateLimiters.general);
  app.use('/api', createAuthenticationMiddleware({ cookieName: securityConfig.sessionCookieName }));
  app.use('/api', createCsrfMiddleware());
  app.use('/api', requireAccountState);
  app.use('/api', createProjectAuthorizationMiddleware());
  app.use('/api', routes);
  app.use(notFoundMiddleware);
  app.use(createErrorHandler({ logger }));

  return app;
}

const app = createApp();

export default app;
