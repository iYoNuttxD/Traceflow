// Rotas placeholder do modulo de requisitos.
// TODO: Conectar controllers reais durante a implementacao de RF48 e RF49.
import { Router } from 'express';
import { requirementController } from './requirement.controller.js';

const router = Router();
const placeholder = requirementController.notImplemented;

router.get('/projects/:projectId/requirements', placeholder);
router.post('/projects/:projectId/requirements', placeholder);
router.get('/requirements/:id', placeholder);
router.put('/requirements/:id', placeholder);
router.delete('/requirements/:id', placeholder);

export default router;
