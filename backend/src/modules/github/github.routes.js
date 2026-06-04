// Rotas do modulo GitHub. Apenas a checagem de autenticacao chama a API externa nesta etapa.
// TODO: Conectar sincronizacao real durante a implementacao de RF03 a RF06 e RF50.
import { Router } from 'express';
import { githubController } from './github.controller.js';

const router = Router();
const placeholder = githubController.notImplemented;

router.get('/github/auth/check', githubController.checkAuthentication);
router.get('/github/repositories', githubController.listRepositories);
router.post('/projects/:projectId/github/sync', placeholder);
router.get('/projects/:projectId/github/artifacts', placeholder);

export default router;
