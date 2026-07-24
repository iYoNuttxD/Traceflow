import { asyncHandler } from '../../shared/http/index.js';
import { traceabilityService } from './traceability.service.js';

export const traceabilityController = {
  getRequirementsMatrix: asyncHandler(async (req, res) => {
    return res.json(await traceabilityService.getRequirementsMatrix(req.params.projectId));
  }, { fallbackMessage: 'Erro interno ao carregar matriz de rastreabilidade.' }),

  getRequirementTraceability: asyncHandler(async (req, res) => {
    const traceability = await traceabilityService.getRequirementTraceability(
      req.params.projectId,
      req.params.requirementId
    );
    return res.json(traceability);
  }, { fallbackMessage: 'Erro interno ao carregar cadeia de rastreabilidade.' }),

  async notImplemented(req, res) {
    return res.status(501).json({
      message: 'Endpoint de rastreabilidade preparado para desenvolvimento futuro.'
    });
  }
};
