// Rotas de sprints, marcos e cronograma. Regras de negocio ficam no service.
import { Router } from 'express';
import { emptyBodySchema, validateRequest } from '../../shared/validation/index.js';
import { sprintController } from './sprint.controller.js';
import {
  createMilestoneBodySchema,
  createSprintBodySchema,
  milestoneIdParamsSchema,
  milestoneSearchQuerySchema,
  milestoneStatusBodySchema,
  replaceSprintTasksBodySchema,
  scheduleQuerySchema,
  sprintIdParamsSchema,
  sprintProjectParamsSchema,
  sprintSearchQuerySchema,
  sprintStatusBodySchema,
  updateMilestoneBodySchema,
  updateSprintBodySchema
} from './sprint.validation.js';

const router = Router();

router.post(
  '/projects/:projectId/sprints',
  validateRequest({ params: sprintProjectParamsSchema, body: createSprintBodySchema }),
  sprintController.create
);
router.get(
  '/projects/:projectId/sprints',
  validateRequest({ params: sprintProjectParamsSchema, query: sprintSearchQuerySchema }),
  sprintController.findByProject
);
router.get(
  '/sprints/:id',
  validateRequest({ params: sprintIdParamsSchema }),
  sprintController.findById
);
router.put(
  '/sprints/:id',
  validateRequest({ params: sprintIdParamsSchema, body: updateSprintBodySchema }),
  sprintController.update
);
router.patch(
  '/sprints/:id/status',
  validateRequest({ params: sprintIdParamsSchema, body: sprintStatusBodySchema }),
  sprintController.updateStatus
);
router.delete(
  '/sprints/:id',
  validateRequest({ params: sprintIdParamsSchema, body: emptyBodySchema }),
  sprintController.delete
);
router.get(
  '/sprints/:id/tasks',
  validateRequest({ params: sprintIdParamsSchema }),
  sprintController.findTasksBySprint
);
router.put(
  '/sprints/:id/tasks',
  validateRequest({ params: sprintIdParamsSchema, body: replaceSprintTasksBodySchema }),
  sprintController.replaceTasks
);

router.post(
  '/projects/:projectId/milestones',
  validateRequest({ params: sprintProjectParamsSchema, body: createMilestoneBodySchema }),
  sprintController.createMilestone
);
router.get(
  '/projects/:projectId/milestones',
  validateRequest({ params: sprintProjectParamsSchema, query: milestoneSearchQuerySchema }),
  sprintController.findMilestonesByProject
);
router.get(
  '/milestones/:id',
  validateRequest({ params: milestoneIdParamsSchema }),
  sprintController.findMilestoneById
);
router.put(
  '/milestones/:id',
  validateRequest({ params: milestoneIdParamsSchema, body: updateMilestoneBodySchema }),
  sprintController.updateMilestone
);
router.patch(
  '/milestones/:id/status',
  validateRequest({ params: milestoneIdParamsSchema, body: milestoneStatusBodySchema }),
  sprintController.updateMilestoneStatus
);
router.delete(
  '/milestones/:id',
  validateRequest({ params: milestoneIdParamsSchema, body: emptyBodySchema }),
  sprintController.deleteMilestone
);

router.get(
  '/projects/:projectId/schedule',
  validateRequest({ params: sprintProjectParamsSchema, query: scheduleQuerySchema }),
  sprintController.getSchedule
);

export default router;
