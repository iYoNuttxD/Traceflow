// Rotas placeholder da futura integracao GitHub via Octokit.
// TODO: Conectar controllers reais durante a implementacao de RF03 a RF06 e RF50.
import { Router } from 'express';
import { githubController } from './github.controller.js';

const router = Router();
const placeholder = githubController.notImplemented;

router.post('/projects/:projectId/github/sync', placeholder);
router.get('/projects/:projectId/github/artifacts', placeholder);

export default router;
