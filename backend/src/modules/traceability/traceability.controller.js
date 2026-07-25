import { asyncHandler } from '../../shared/http/index.js';
import { auditService } from '../audit/audit.service.js';
import { commitSuggestionService } from './commit-suggestion.service.js';
import { traceabilityService } from './traceability.service.js';

export const traceabilityController = {
  scanCommitSuggestions: asyncHandler(async (req, res) => {
    const result = await commitSuggestionService.scanHistorical(req.params.projectId, {
      actorUserId: req.auth.user.id,
      requestId: req.requestId,
      auditService
    });
    return res.json(result);
  }, { fallbackMessage: 'Erro interno ao analisar sugestões de commits.' }),

  listCommitSuggestions: asyncHandler(async (req, res) => {
    const result = await commitSuggestionService.list(req.params.projectId, req.query);
    return res.json({
      ...result,
      permissions: { canReview: req.projectMembership?.role !== 'VIEWER' }
    });
  }, { fallbackMessage: 'Erro interno ao listar sugestões de commits.' }),

  confirmCommitSuggestion: asyncHandler(async (req, res) => {
    const result = await commitSuggestionService.confirm(
      req.params.projectId,
      req.params.suggestionId,
      { actorUserId: req.auth.user.id, requestId: req.requestId }
    );
    return res.json({ message: 'Sugestão confirmada com sucesso.', ...result });
  }, { fallbackMessage: 'Erro interno ao confirmar sugestão de commit.' }),

  rejectCommitSuggestion: asyncHandler(async (req, res) => {
    const result = await commitSuggestionService.reject(
      req.params.projectId,
      req.params.suggestionId,
      { actorUserId: req.auth.user.id, requestId: req.requestId }
    );
    return res.json({ message: 'Sugestão rejeitada com sucesso.', ...result });
  }, { fallbackMessage: 'Erro interno ao rejeitar sugestão de commit.' }),

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
