// Rotas do módulo GitHub e dos artefatos tipados importados.
import { Router } from 'express';
import { emptyBodySchema, validateRequest } from '../../shared/validation/index.js';
import { githubController } from './github.controller.js';
import { githubAppController } from './github-app.controller.js';
import {
  githubAppStartBodySchema,
  githubConnectBodySchema,
  githubConnectParamsSchema,
  githubInstallationParamsSchema,
  githubRepositoryListQuerySchema,
  githubProjectParamsSchema,
  githubSearchQuerySchema
} from './github.validation.js';
import { requireVerifiedEmail } from '../../middlewares/auth/email-verification.middleware.js';

const router = Router();
router.post(
  '/github/app/installations/start',
  requireVerifiedEmail,
  validateRequest({ body: githubAppStartBodySchema }),
  githubAppController.start
);
router.get('/github/app/installations', githubAppController.listInstallations);
router.get(
  '/github/app/repositories',
  validateRequest({ query: githubRepositoryListQuerySchema }),
  githubAppController.listAllRepositories
);
router.get(
  '/github/app/installations/:installationId/repositories',
  validateRequest({
    params: githubInstallationParamsSchema,
    query: githubRepositoryListQuerySchema
  }),
  githubAppController.listRepositories
);
router.put(
  '/projects/:projectId/github/integration',
  requireVerifiedEmail,
  validateRequest({ params: githubConnectParamsSchema, body: githubConnectBodySchema }),
  githubAppController.connectProject
);
router.post(
  '/projects/:projectId/github/sync',
  requireVerifiedEmail,
  validateRequest({ params: githubProjectParamsSchema, body: emptyBodySchema }),
  githubController.syncProjectGithubData
);
router.get(
  '/projects/:projectId/github/sync/status',
  validateRequest({ params: githubProjectParamsSchema }),
  githubController.getProjectGithubSyncStatus
);
router.get(
  '/projects/:projectId/commits',
  validateRequest({ params: githubProjectParamsSchema, query: githubSearchQuerySchema }),
  githubController.listProjectCommits
);
router.get(
  '/projects/:projectId/pull-requests',
  validateRequest({ params: githubProjectParamsSchema, query: githubSearchQuerySchema }),
  githubController.listProjectPullRequests
);
router.get(
  '/projects/:projectId/issues',
  validateRequest({ params: githubProjectParamsSchema, query: githubSearchQuerySchema }),
  githubController.listProjectIssues
);

export default router;
