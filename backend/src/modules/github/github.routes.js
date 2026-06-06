// Rotas do modulo GitHub e dos artefatos importados.
// TODO: Evoluir a sincronizacao para issues em RF05.
import { Router } from 'express';
import { githubController } from './github.controller.js';

const router = Router();
const placeholder = githubController.notImplemented;

router.get('/github/auth/check', githubController.checkAuthentication);
router.get('/github/repositories', githubController.listRepositories);
router.post('/projects/:projectId/github/sync', githubController.syncProjectGithubArtifacts);
router.get('/projects/:projectId/commits', githubController.listProjectCommits);
router.get('/projects/:projectId/pull-requests', githubController.listProjectPullRequests);
router.get('/projects/:projectId/github/artifacts', placeholder);

export default router;
