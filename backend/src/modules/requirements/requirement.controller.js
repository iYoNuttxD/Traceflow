// Controller do modulo de requisitos. Recebe HTTP e delega regras ao service.
import { requirementService } from './requirement.service.js';

function sendError(res, error, fallbackMessage = 'Erro interno ao processar requisito.') {
  if (!error.statusCode) {
    console.error(fallbackMessage, error);
  }

  return res.status(error.statusCode || 500).json({
    message: error.statusCode ? error.message : fallbackMessage
  });
}

export const requirementController = {
  async create(req, res) {
    try {
      const requirement = await requirementService.createRequirement(
        req.params.projectId,
        req.body
      );

      return res.status(201).json({
        message: 'Requisito cadastrado com sucesso.',
        requirement
      });
    } catch (error) {
      return sendError(res, error);
    }
  },

  async findByProject(req, res) {
    try {
      const requirements = await requirementService.findRequirementsByProject(
        req.params.projectId,
        req.query
      );

      return res.json({
        total: requirements.length,
        requirements
      });
    } catch (error) {
      return sendError(res, error);
    }
  },

  async findById(req, res) {
    try {
      const requirement = await requirementService.getRequirementById(req.params.id);

      return res.json({ requirement });
    } catch (error) {
      return sendError(res, error);
    }
  },

  async update(req, res) {
    try {
      const requirement = await requirementService.updateRequirement(req.params.id, req.body);

      return res.json({
        message: 'Requisito atualizado com sucesso.',
        requirement
      });
    } catch (error) {
      return sendError(res, error);
    }
  },

  async updateStatus(req, res) {
    try {
      const requirement = await requirementService.updateRequirementStatus(
        req.params.id,
        req.body.status
      );

      return res.json({
        message: 'Status do requisito atualizado com sucesso.',
        requirement
      });
    } catch (error) {
      return sendError(res, error);
    }
  },

  async findTasksByRequirement(req, res) {
    try {
      const tasks = await requirementService.findTasksByRequirement(req.params.id);

      return res.json({
        requirementId: Number(req.params.id),
        total: tasks.length,
        tasks
      });
    } catch (error) {
      return sendError(res, error);
    }
  },

  async confirmCompletion(req, res) {
    try {
      const requirement = await requirementService.confirmCompletion(req.params.id);

      return res.json({
        message: 'Requisito concluído com sucesso.',
        requirement
      });
    } catch (error) {
      return sendError(res, error);
    }
  },

  async getTaskCoverage(req, res) {
    try {
      const coverage = await requirementService.getRequirementTaskCoverage(
        req.params.projectId
      );

      return res.json(coverage);
    } catch (error) {
      return sendError(
        res,
        error,
        'Erro interno ao calcular cobertura de requisitos com tarefas.'
      );
    }
  }
};
