import { asyncHandler } from '../../shared/http/index.js';
import { requirementService } from './requirement.service.js';
import { auditService } from '../audit/audit.service.js';

const requirementFallback = 'Erro interno ao processar requisito.';

export const requirementController = {
  create: asyncHandler(async (req, res) => {
    const requirement = await requirementService.createRequirement(
      req.params.projectId,
      req.body
    );
    await auditService.recordOperational({ actorUserId: req.auth.user.id, projectId: requirement.projectId, requestId: req.requestId, action: 'REQUIREMENT_CREATED', resourceType: 'Requirement', resourceId: requirement.id });
    return res.status(201).json({ message: 'Requisito cadastrado com sucesso.', requirement });
  }, { fallbackMessage: requirementFallback }),

  findByProject: asyncHandler(async (req, res) => {
    const requirements = await requirementService.findRequirementsByProject(
      req.params.projectId,
      req.query
    );
    return res.json({ total: requirements.length, requirements });
  }, { fallbackMessage: requirementFallback }),

  findById: asyncHandler(async (req, res) => {
    const requirement = await requirementService.getRequirementById(req.params.id);
    return res.json({ requirement });
  }, { fallbackMessage: requirementFallback }),

  update: asyncHandler(async (req, res) => {
    const requirement = await requirementService.updateRequirement(req.params.id, req.body);
    await auditService.recordOperational({ actorUserId: req.auth.user.id, projectId: requirement.projectId, requestId: req.requestId, action: 'REQUIREMENT_UPDATED', resourceType: 'Requirement', resourceId: requirement.id });
    return res.json({ message: 'Requisito atualizado com sucesso.', requirement });
  }, { fallbackMessage: requirementFallback }),

  delete: asyncHandler(async (req, res) => {
    const requirement = await requirementService.getRequirementById(req.params.id);
    await requirementService.deleteRequirement(req.params.id);
    await auditService.recordOperational({ actorUserId: req.auth.user.id, projectId: requirement.projectId, requestId: req.requestId, action: 'REQUIREMENT_DELETED', resourceType: 'Requirement', resourceId: requirement.id });
    return res.json({ message: 'Requisito excluído com sucesso.' });
  }, { fallbackMessage: 'Erro interno ao excluir requisito.' }),

  updateStatus: asyncHandler(async (req, res) => {
    const requirement = await requirementService.updateRequirementStatus(
      req.params.id,
      req.body.status
    );
    return res.json({
      message: 'Status do requisito atualizado com sucesso.',
      requirement
    });
  }, { fallbackMessage: requirementFallback }),

  findTasksByRequirement: asyncHandler(async (req, res) => {
    const tasks = await requirementService.findTasksByRequirement(req.params.id);
    return res.json({ requirementId: req.params.id, total: tasks.length, tasks });
  }, { fallbackMessage: requirementFallback }),

  confirmCompletion: asyncHandler(async (req, res) => {
    const requirement = await requirementService.confirmCompletion(req.params.id);
    return res.json({ message: 'Requisito concluído com sucesso.', requirement });
  }, { fallbackMessage: requirementFallback }),

  getTaskCoverage: asyncHandler(async (req, res) => {
    const coverage = await requirementService.getRequirementTaskCoverage(req.params.projectId);
    return res.json(coverage);
  }, { fallbackMessage: 'Erro interno ao calcular cobertura de requisitos com tarefas.' })
};
