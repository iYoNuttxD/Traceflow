// Rotas do modulo de requisitos. Regras de negocio ficam no service.
import { Router } from 'express';
import { requirementController } from './requirement.controller.js';

const router = Router();

router.post('/projects/:projectId/requirements', requirementController.create);
router.get('/projects/:projectId/requirements', requirementController.findByProject);
router.get('/requirements/:id', requirementController.findById);
router.put('/requirements/:id', requirementController.update);
router.patch('/requirements/:id/status', requirementController.updateStatus);
router.get('/requirements/:id/tasks', requirementController.findTasksByRequirement);

export default router;
