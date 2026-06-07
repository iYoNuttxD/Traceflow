// Rotas do modulo de tarefas. Regras de negocio ficam no service.
import { Router } from 'express';
import { taskController } from './task.controller.js';

const router = Router();

router.post('/projects/:projectId/tasks', taskController.create);
router.get('/projects/:projectId/tasks', taskController.findByProject);
router.get('/projects/:projectId/tasks/metrics', taskController.getMetrics);
router.get('/projects/:projectId/kanban', taskController.getKanbanBoard);
router.get('/projects/:projectId/kanban/movements', taskController.listMovements);
router.get('/projects/:projectId/kanban/metrics', taskController.getKanbanMetrics);
router.get('/tasks/:id', taskController.findById);
router.put('/tasks/:id', taskController.update);
router.patch('/tasks/:id/status', taskController.updateStatus);
router.patch('/tasks/:id/move', taskController.moveTask);

export default router;
