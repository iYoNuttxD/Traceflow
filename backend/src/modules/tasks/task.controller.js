// Controller do modulo de tarefas. Recebe HTTP e delega regras ao service.
import { taskService } from './task.service.js';

function sendError(res, error) {
  return res.status(error.statusCode || 500).json({
    message: error.statusCode ? error.message : 'Erro interno ao processar tarefa.'
  });
}

export const taskController = {
  async create(req, res) {
    try {
      const task = await taskService.createTask(req.params.projectId, req.body);

      return res.status(201).json({
        message: 'Tarefa cadastrada com sucesso.',
        task
      });
    } catch (error) {
      return sendError(res, error);
    }
  },

  async findByProject(req, res) {
    try {
      const tasks = await taskService.findTasksByProject(req.params.projectId);

      return res.json({
        total: tasks.length,
        tasks
      });
    } catch (error) {
      return sendError(res, error);
    }
  },

  async findById(req, res) {
    try {
      const task = await taskService.getTaskById(req.params.id);

      return res.json({ task });
    } catch (error) {
      return sendError(res, error);
    }
  },

  async update(req, res) {
    try {
      const task = await taskService.updateTask(req.params.id, req.body);

      return res.json({
        message: 'Tarefa atualizada com sucesso.',
        task
      });
    } catch (error) {
      return sendError(res, error);
    }
  },

  async updateStatus(req, res) {
    try {
      const task = await taskService.updateTaskStatus(req.params.id, req.body.status);

      return res.json({
        message: 'Status da tarefa atualizado com sucesso.',
        task
      });
    } catch (error) {
      return sendError(res, error);
    }
  },

  async getMetrics(req, res) {
    try {
      const metrics = await taskService.getTaskMetrics(
        req.params.projectId,
        req.query.startDate,
        req.query.endDate
      );

      return res.json(metrics);
    } catch (error) {
      return sendError(res, error);
    }
  }
};
