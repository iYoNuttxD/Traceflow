// Controller do modulo de tarefas. Recebe HTTP e delega regras ao service.
import { taskService } from './task.service.js';

function sendError(res, error, fallbackMessage = 'Erro interno ao processar tarefa.') {
  return res.status(error.statusCode || 500).json({
    message: error.statusCode ? error.message : fallbackMessage
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
      const tasks = await taskService.findTasksByProject(req.params.projectId, req.query);

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

  async linkPullRequest(req, res) {
    try {
      const task = await taskService.linkPullRequest(req.params.id, req.body);

      return res.json({
        message: 'Pull request vinculado à tarefa com sucesso.',
        task
      });
    } catch (error) {
      return sendError(
        res,
        error,
        'Erro interno ao vincular pull request à tarefa.'
      );
    }
  },

  async unlinkPullRequest(req, res) {
    try {
      const task = await taskService.unlinkPullRequest(req.params.id);

      return res.json({
        message: 'Pull request removido da tarefa.',
        task
      });
    } catch (error) {
      return sendError(
        res,
        error,
        'Erro interno ao remover pull request da tarefa.'
      );
    }
  },

  async linkRequirement(req, res) {
    try {
      const task = await taskService.linkRequirement(req.params.id, req.body);

      return res.json({
        message: 'Requisito vinculado à tarefa.',
        task
      });
    } catch (error) {
      return sendError(res, error, 'Erro interno ao vincular requisito à tarefa.');
    }
  },

  async unlinkRequirement(req, res) {
    try {
      const task = await taskService.unlinkRequirement(req.params.id);

      return res.json({
        message: 'Vínculo com requisito removido.',
        task
      });
    } catch (error) {
      return sendError(res, error, 'Erro interno ao remover requisito da tarefa.');
    }
  },

  async delete(req, res) {
    try {
      await taskService.deleteTask(req.params.id);

      return res.json({
        message: 'Tarefa excluída com sucesso.'
      });
    } catch (error) {
      return sendError(res, error, 'Erro interno ao excluir tarefa.');
    }
  },

  async listCommits(req, res) {
    try {
      const commits = await taskService.listTaskCommits(req.params.id);

      return res.json({
        total: commits.length,
        commits
      });
    } catch (error) {
      return sendError(
        res,
        error,
        'Erro interno ao listar commits vinculados à tarefa.'
      );
    }
  },

  async linkCommit(req, res) {
    try {
      const commits = await taskService.linkCommit(req.params.id, req.body);

      return res.status(201).json({
        message: 'Commit vinculado à tarefa com sucesso.',
        commits
      });
    } catch (error) {
      return sendError(res, error, 'Erro interno ao vincular commit à tarefa.');
    }
  },

  async unlinkCommit(req, res) {
    try {
      const commits = await taskService.unlinkCommit(req.params.id, req.params.commitId);

      return res.json({
        message: 'Commit removido da tarefa.',
        commits
      });
    } catch (error) {
      return sendError(res, error, 'Erro interno ao remover commit da tarefa.');
    }
  },

  async listIssues(req, res) {
    try {
      const issues = await taskService.listTaskIssues(req.params.id);

      return res.json({
        total: issues.length,
        issues
      });
    } catch (error) {
      return sendError(
        res,
        error,
        'Erro interno ao listar issues vinculadas à tarefa.'
      );
    }
  },

  async linkIssue(req, res) {
    try {
      const issues = await taskService.linkIssue(req.params.id, req.body);

      return res.status(201).json({
        message: 'Issue vinculada à tarefa com sucesso.',
        issues
      });
    } catch (error) {
      return sendError(res, error, 'Erro interno ao vincular issue à tarefa.');
    }
  },

  async unlinkIssue(req, res) {
    try {
      const issues = await taskService.unlinkIssue(req.params.id, req.params.issueId);

      return res.json({
        message: 'Issue removida da tarefa.',
        issues
      });
    } catch (error) {
      return sendError(res, error, 'Erro interno ao remover issue da tarefa.');
    }
  },

  async getKanbanBoard(req, res) {
    try {
      const kanban = await taskService.getKanbanBoard(req.params.projectId);

      return res.json(kanban);
    } catch (error) {
      return sendError(res, error, 'Erro interno ao processar Kanban.');
    }
  },

  async moveTask(req, res) {
    try {
      const result = await taskService.moveTask(req.params.id, req.body);

      return res.json({
        message: 'Tarefa movida com sucesso.',
        task: result.task,
        movement: result.movement
      });
    } catch (error) {
      return sendError(res, error, 'Erro interno ao processar Kanban.');
    }
  },

  async listMovements(req, res) {
    try {
      const movements = await taskService.listMovements(req.params.projectId, req.query);

      return res.json(movements);
    } catch (error) {
      return sendError(res, error, 'Erro interno ao processar Kanban.');
    }
  },

  async getKanbanMetrics(req, res) {
    try {
      const metrics = await taskService.getKanbanMetrics(req.params.projectId, req.query);

      return res.json(metrics);
    } catch (error) {
      return sendError(res, error, 'Erro interno ao processar Kanban.');
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
  },

  async getPullRequestCoverage(req, res) {
    try {
      const coverage = await taskService.getPullRequestCoverage(req.params.projectId);

      return res.json(coverage);
    } catch (error) {
      return sendError(
        res,
        error,
        'Erro interno ao calcular cobertura com pull requests.'
      );
    }
  },

  async getCommitCoverage(req, res) {
    try {
      const coverage = await taskService.getCommitCoverage(req.params.projectId);

      return res.json(coverage);
    } catch (error) {
      return sendError(
        res,
        error,
        'Erro interno ao calcular cobertura com commits.'
      );
    }
  },

  async getIssueCoverage(req, res) {
    try {
      const coverage = await taskService.getIssueCoverage(req.params.projectId);

      return res.json(coverage);
    } catch (error) {
      return sendError(
        res,
        error,
        'Erro interno ao calcular cobertura com issues.'
      );
    }
  }
};
