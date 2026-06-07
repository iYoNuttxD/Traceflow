// Rotas do modulo de projetos. Regras de negocio ficam no service.
import { Router } from 'express';
import { projectController } from './project.controller.js';

const router = Router();

router.post('/from-github', projectController.createFromGithub);
router.post('/join', projectController.join);
router.patch('/:projectId/github/sync-settings', projectController.updateGithubSyncSettings);
router.get('/:projectId/members', projectController.listMembers);
router.post('/:projectId/members', projectController.addMember);
router.post('/', projectController.create);
router.get('/', projectController.findAll);
router.get('/:id', projectController.findById);
router.put('/:id', projectController.update);
router.delete('/:id', projectController.notImplemented);

export default router;
