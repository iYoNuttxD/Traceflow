import { Router } from 'express';
import { emptyObject, validateRequest } from '../../shared/validation/index.js';
import { indicatorsController } from './indicators.controller.js';
import {
  flowTaskPeriodQuerySchema,
  indicatorPeriodQuerySchema,
  indicatorProjectParamsSchema,
  sprintAnalyticsQuerySchema
} from './indicators.validation.js';

const router = Router();
router.get(
  '/projects/:projectId/indicators/progress',
  validateRequest({ params: indicatorProjectParamsSchema, query: emptyObject }),
  indicatorsController.progress
);
router.get(
  '/projects/:projectId/indicators/activity',
  validateRequest({ params: indicatorProjectParamsSchema, query: indicatorPeriodQuerySchema }),
  indicatorsController.activity
);
router.get(
  '/projects/:projectId/indicators/github',
  validateRequest({ params: indicatorProjectParamsSchema, query: indicatorPeriodQuerySchema }),
  indicatorsController.github
);
router.get(
  '/projects/:projectId/indicators/tasks',
  validateRequest({ params: indicatorProjectParamsSchema, query: flowTaskPeriodQuerySchema }),
  indicatorsController.tasks
);
router.get(
  '/projects/:projectId/indicators/sprints',
  validateRequest({ params: indicatorProjectParamsSchema, query: sprintAnalyticsQuerySchema }),
  indicatorsController.sprints
);

export default router;
