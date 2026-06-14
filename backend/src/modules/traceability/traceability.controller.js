// Controller de rastreabilidade. Consolida cadeias ja registradas no projeto.
import { traceabilityService } from './traceability.service.js';

function sendError(res, error, fallbackMessage = 'Erro interno ao processar rastreabilidade.') {
  return res.status(error.statusCode || 500).json({
    message: error.statusCode ? error.message : fallbackMessage
  });
}

export const traceabilityController = {
  async getRequirementsMatrix(req, res) {
    try {
      const matrix = await traceabilityService.getRequirementsMatrix(req.params.projectId);

      return res.json(matrix);
    } catch (error) {
      return sendError(
        res,
        error,
        'Erro interno ao carregar matriz de rastreabilidade.'
      );
    }
  },

  async getRequirementTraceability(req, res) {
    try {
      const traceability = await traceabilityService.getRequirementTraceability(
        req.params.projectId,
        req.params.requirementId
      );

      return res.json(traceability);
    } catch (error) {
      return sendError(
        res,
        error,
        'Erro interno ao carregar cadeia de rastreabilidade.'
      );
    }
  },

  async notImplemented(req, res) {
    return res.status(501).json({
      message: 'Endpoint de rastreabilidade preparado para desenvolvimento futuro.'
    });
  }
};
