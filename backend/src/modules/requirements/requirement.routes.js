// Rotas do modulo de requisitos. Regras de negocio ficam no service.
import { Router } from 'express';
import { requirementController } from './requirement.controller.js';

const router = Router();

router.post('/projects/:projectId/requirements', requirementController.create);
router.get('/projects/:projectId/requirements', requirementController.findByProject);
router.get(
  '/projects/:projectId/traceability/requirement-task-coverage',
  requirementController.getTaskCoverage
);
router.get('/requirements/:id', requirementController.findById);
router.put('/requirements/:id', requirementController.update);
router.patch('/requirements/:id/status', requirementController.updateStatus);
router.patch('/requirements/:id/confirm-completion', requirementController.confirmCompletion);
router.get('/requirements/:id/tasks', requirementController.findTasksByRequirement);
router.post('/requirements/:requirementId/tasks/:taskId/link', requirementController.linkTaskToRequirement);
router.delete('/requirements/:requirementId/tasks/:taskId/link', requirementController.unlinkTaskFromRequirement);
router.get('/tasks/:taskId/requirement', requirementController.findRequirementByTask);
router.get('/projects/:projectId/requirements-with-tasks', requirementController.findRequirementsWithTasksByProject);

export default router;
