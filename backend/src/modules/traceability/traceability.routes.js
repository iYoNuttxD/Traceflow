// Rotas placeholder do modulo central de rastreabilidade.
// TODO: Conectar controllers reais durante a implementacao dos vinculos manuais.
import { Router } from 'express';
import { validateRequest } from '../../shared/validation/index.js';
import { traceabilityController } from './traceability.controller.js';
import {
  traceabilityProjectParamsSchema,
  traceabilityRequirementParamsSchema
} from './traceability.validation.js';

const router = Router();
const placeholder = traceabilityController.notImplemented;

router.get(
  '/projects/:projectId/traceability/requirements-matrix',
  validateRequest({ params: traceabilityProjectParamsSchema }),
  traceabilityController.getRequirementsMatrix
);
router.get(
  '/projects/:projectId/traceability/requirements/:requirementId',
  validateRequest({ params: traceabilityRequirementParamsSchema }),
  traceabilityController.getRequirementTraceability
);
router.post('/projects/:projectId/trace-links', placeholder);
router.get('/requirements/:requirementId/traceability', placeholder);
router.get('/tasks/:taskId/traceability', placeholder);
router.get('/github-artifacts/:artifactId/traceability', placeholder);
router.delete('/trace-links/:id', placeholder);

export default router;
