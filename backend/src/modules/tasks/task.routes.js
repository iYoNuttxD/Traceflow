// Rotas placeholder do modulo de tarefas.
// TODO: Conectar controllers reais durante a implementacao de RF07 e RF08.
import { Router } from 'express';
import { taskController } from './task.controller.js';

const router = Router();
const placeholder = taskController.notImplemented;

router.get('/projects/:projectId/tasks', placeholder);
router.post('/projects/:projectId/tasks', placeholder);
router.get('/tasks/:id', placeholder);
router.put('/tasks/:id', placeholder);
router.patch('/tasks/:id/status', placeholder);
router.delete('/tasks/:id', placeholder);

export default router;
