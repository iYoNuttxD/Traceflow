import { asyncHandler } from '../../shared/http/index.js';
import { traceabilityService } from './traceability.service.js';

export const traceabilityController = {
  getRequirementsMatrix: asyncHandler(async (req, res) => {
    return res.json(await traceabilityService.getRequirementsMatrix(req.params.projectId, req.query));
  }, { fallbackMessage: 'Erro interno ao carregar matriz de rastreabilidade.' }),

  getRequirementTraceability: asyncHandler(async (req, res) => {
    const traceability = await traceabilityService.getRequirementTraceability(
      req.params.projectId,
      req.params.requirementId,
      req.query
    );
    return res.json(traceability);
  }, { fallbackMessage: 'Erro interno ao carregar cadeia de rastreabilidade.' }),

  getTaskTraceability: asyncHandler(async (req, res) => {
    return res.json(await traceabilityService.getTaskTraceability(
      req.params.projectId,
      req.params.taskId,
      req.query
    ));
  }, { fallbackMessage: 'Erro interno ao carregar rastreabilidade da tarefa.' }),

  getArtifactTraceability: asyncHandler(async (req, res) => {
    return res.json(await traceabilityService.getArtifactTraceability(
      req.params.projectId,
      req.params.artifactType,
      req.params.artifactId,
      req.query
    ));
  }, { fallbackMessage: 'Erro interno ao carregar rastreabilidade do artefato.' }),

  getRequirementTaskCoverage: asyncHandler(async (req, res) => {
    return res.json(await traceabilityService.getRequirementTaskCoverage(req.params.projectId));
  }),
  getPullRequestCoverage: asyncHandler(async (req, res) => {
    return res.json(await traceabilityService.getPullRequestCoverage(req.params.projectId));
  }),
  getCommitCoverage: asyncHandler(async (req, res) => {
    return res.json(await traceabilityService.getCommitCoverage(req.params.projectId));
  }),
  getIssueCoverage: asyncHandler(async (req, res) => {
    return res.json(await traceabilityService.getIssueCoverage(req.params.projectId));
  })
};
