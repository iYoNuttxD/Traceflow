// Rotas placeholder do modulo de projetos.
// TODO: Conectar controllers reais durante a implementacao completa de RF01 e RF22.
import { Router } from 'express';
import { projectController } from './project.controller.js';

const router = Router();
const placeholder = projectController.notImplemented;

router.post('/from-github', projectController.createFromGithub);
router.patch('/:projectId/github/sync-settings', projectController.updateGithubSyncSettings);
router.get('/', placeholder);
router.post('/', placeholder);
router.get('/:id', projectController.getById);
router.put('/:id', placeholder);
router.delete('/:id', placeholder);

export default router;
