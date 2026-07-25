// Rotas do módulo GitHub e dos artefatos tipados importados.
import { Router } from 'express';
import { emptyBodySchema, validateRequest } from '../../shared/validation/index.js';
import { githubController } from './github.controller.js';
import { githubProjectParamsSchema, githubSearchQuerySchema } from './github.validation.js';

const router = Router();
router.get('/github/auth/check', githubController.checkAuthentication);
router.get('/github/repositories', githubController.listRepositories);
router.post('/projects/:projectId/github/sync', validateRequest({ params: githubProjectParamsSchema, body: emptyBodySchema }), githubController.syncProjectGithubData);
router.get('/projects/:projectId/commits', validateRequest({ params: githubProjectParamsSchema, query: githubSearchQuerySchema }), githubController.listProjectCommits);
router.get('/projects/:projectId/pull-requests', validateRequest({ params: githubProjectParamsSchema, query: githubSearchQuerySchema }), githubController.listProjectPullRequests);
router.get('/projects/:projectId/issues', validateRequest({ params: githubProjectParamsSchema, query: githubSearchQuerySchema }), githubController.listProjectIssues);

export default router;
