// Rotas do modulo GitHub e dos artefatos importados.
// TODO: Evoluir estas rotas com consultas consolidadas de artefatos em RF06.
import { Router } from 'express';
import { emptyBodySchema, validateRequest } from '../../shared/validation/index.js';
import { githubController } from './github.controller.js';
import { githubProjectParamsSchema, githubSearchQuerySchema } from './github.validation.js';

const router = Router();
const placeholder = githubController.notImplemented;

router.get('/github/auth/check', githubController.checkAuthentication);
router.get('/github/repositories', githubController.listRepositories);
router.post('/projects/:projectId/github/sync', validateRequest({ params: githubProjectParamsSchema, body: emptyBodySchema }), githubController.syncProjectGithubData);
router.get('/projects/:projectId/commits', validateRequest({ params: githubProjectParamsSchema, query: githubSearchQuerySchema }), githubController.listProjectCommits);
router.get('/projects/:projectId/pull-requests', validateRequest({ params: githubProjectParamsSchema, query: githubSearchQuerySchema }), githubController.listProjectPullRequests);
router.get('/projects/:projectId/issues', validateRequest({ params: githubProjectParamsSchema, query: githubSearchQuerySchema }), githubController.listProjectIssues);
router.get('/projects/:projectId/github/artifacts', placeholder);

export default router;
