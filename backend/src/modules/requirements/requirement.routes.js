// Rotas do modulo de requisitos. Regras de negocio ficam no service.
import { Router } from 'express';
import { emptyBodySchema, validateRequest } from '../../shared/validation/index.js';
import { requirementController } from './requirement.controller.js';
import {
  createRequirementBodySchema,
  requirementIdParamsSchema,
  requirementProjectParamsSchema,
  requirementSearchQuerySchema,
  requirementStatusBodySchema,
  replaceRequirementTasksBodySchema,
  updateRequirementBodySchema
} from './requirement.validation.js';

const router = Router();

router.post(
  '/projects/:projectId/requirements',
  validateRequest({ params: requirementProjectParamsSchema, body: createRequirementBodySchema }),
  requirementController.create
);
router.get(
  '/projects/:projectId/requirements',
  validateRequest({ params: requirementProjectParamsSchema, query: requirementSearchQuerySchema }),
  requirementController.findByProject
);
router.get(
  '/requirements/:id',
  validateRequest({ params: requirementIdParamsSchema }),
  requirementController.findById
);
router.put(
  '/requirements/:id',
  validateRequest({ params: requirementIdParamsSchema, body: updateRequirementBodySchema }),
  requirementController.update
);
router.delete(
  '/requirements/:id',
  validateRequest({ params: requirementIdParamsSchema, body: emptyBodySchema }),
  requirementController.delete
);
router.patch(
  '/requirements/:id/status',
  validateRequest({ params: requirementIdParamsSchema, body: requirementStatusBodySchema }),
  requirementController.updateStatus
);
router.patch(
  '/requirements/:id/confirm-completion',
  validateRequest({ params: requirementIdParamsSchema, body: emptyBodySchema }),
  requirementController.confirmCompletion
);
router.get(
  '/requirements/:id/tasks',
  validateRequest({ params: requirementIdParamsSchema }),
  requirementController.findTasksByRequirement
);
router.put(
  '/requirements/:id/tasks',
  validateRequest({ params: requirementIdParamsSchema, body: replaceRequirementTasksBodySchema }),
  requirementController.replaceTasks
);

export default router;
