// Rotas placeholder do modulo central de rastreabilidade.
// TODO: Conectar controllers reais durante a implementacao dos vinculos manuais.
import { Router } from 'express';
import { traceabilityController } from './traceability.controller.js';

const router = Router();
const placeholder = traceabilityController.notImplemented;

router.post('/projects/:projectId/trace-links', placeholder);
router.get('/requirements/:requirementId/traceability', placeholder);
router.get('/tasks/:taskId/traceability', placeholder);
router.get('/github-artifacts/:artifactId/traceability', placeholder);
router.delete('/trace-links/:id', placeholder);

export default router;
