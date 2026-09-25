import { Router } from 'express';
import { emptyObject, validateRequest } from '../../shared/validation/index.js';
import { indicatorsController } from './indicators.controller.js';
import {
  indicatorPeriodQuerySchema,
  indicatorProjectParamsSchema
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

export default router;
