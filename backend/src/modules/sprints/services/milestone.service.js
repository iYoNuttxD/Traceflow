// Casos de uso de marcos do cronograma (RF10).
// Marco pertence a uma sprint do mesmo projeto (ADR-010 D02): a conclusao de um
// marco fica ancorada no periodo de desenvolvimento que a produziu.
import { milestoneRepository } from '../repositories/milestone.repository.js';
import { buildAuditEvent } from '../../audit/audit.service.js';
import { authorizationService } from '../../authorization/index.js';
import { ERROR_CODES } from '../../../shared/errors/index.js';
import {
  SprintServiceError,
  buildMilestoneData,
  ensureAtLeastOneField,
  ensureMilestoneStatus,
  ensureMilestoneWithinSprint,
  ensureSprintEditable,
  milestoneNotFoundError,
  parseMilestoneId,
  parseProjectId,
  sprintNotFoundError
} from '../sprint.schema.js';
import { ensureProjectExists, ensureSprintExists } from './sprint-crud.service.js';

export async function ensureMilestoneExists(milestoneId) {
  const milestone = await milestoneRepository.findById(milestoneId);
  if (!milestone) throw milestoneNotFoundError();
  return milestone;
}

// A sprint informada precisa existir e pertencer ao mesmo projeto do marco.
// O par 400/404 sem esta guarda seria oraculo: iterando o sprintId, um membro de
// um unico projeto descobriria quais sprints existem em projetos alheios. Quem
// nao enxerga o outro projeto recebe exatamente a resposta de sprint inexistente.
async function ensureMilestoneSprint(sprintId, projectId, context = {}) {
  const sprint = await ensureSprintExists(sprintId);
  if (sprint.projectId !== projectId) {
    if (!(await authorizationService.actorSeesProject(sprint.projectId, context.actorUserId))) {
      throw sprintNotFoundError();
    }
    throw new SprintServiceError(
      'A sprint informada não pertence ao mesmo projeto do marco.',
      400,
      ERROR_CODES.MILESTONE_SPRINT_PROJECT_MISMATCH
    );
  }
  return sprint;
}

// Marco de sprint encerrada acompanha a imutabilidade dela (ADR-010 D12): o
// periodo virou registro, e mexer no marco reescreveria o que ficou registrado.
async function ensureMilestoneMutable(milestone) {
  const sprint = await ensureSprintExists(milestone.sprintId);
  ensureSprintEditable(sprint);
  return sprint;
}

export const milestoneService = {
  async createMilestone(projectId, data, context = {}) {
    const parsedProjectId = parseProjectId(projectId);
    await ensureProjectExists(parsedProjectId);
    const milestoneData = buildMilestoneData(data, true);
    const sprint = await ensureMilestoneSprint(milestoneData.sprintId, parsedProjectId, context);
    ensureSprintEditable(sprint);
    ensureMilestoneWithinSprint(milestoneData.dueDate, sprint);
    return milestoneRepository.create(
      parsedProjectId,
      milestoneData,
      buildAuditEvent({
        actorUserId: context.actorUserId,
        projectId: parsedProjectId,
        requestId: context.requestId,
        action: 'MILESTONE_CREATED',
        resourceType: 'Milestone'
      })
    );
  },

  async findMilestonesByProject(projectId, query = {}) {
    const parsedProjectId = parseProjectId(projectId);
    await ensureProjectExists(parsedProjectId);
    return milestoneRepository.findByProject(parsedProjectId, { status: query.status });
  },

  async getMilestoneById(milestoneId) {
    return ensureMilestoneExists(parseMilestoneId(milestoneId));
  },

  async updateMilestone(milestoneId, data, context = {}) {
    const id = parseMilestoneId(milestoneId);
    const current = await ensureMilestoneExists(id);
    const milestoneData = ensureAtLeastOneField(
      buildMilestoneData(data),
      'Informe ao menos um campo para atualizar o marco.'
    );
    // A sprint atual precisa estar aberta ANTES da troca: mover um marco para
    // fora de uma sprint encerrada mudaria a composicao do periodo fechado.
    await ensureMilestoneMutable(current);
    const sprint =
      milestoneData.sprintId !== undefined
        ? await ensureMilestoneSprint(milestoneData.sprintId, current.projectId, context)
        : await ensureSprintExists(current.sprintId);
    ensureSprintEditable(sprint);
    ensureMilestoneWithinSprint(milestoneData.dueDate ?? current.dueDate, sprint);
    return milestoneRepository.update(
      id,
      milestoneData,
      buildAuditEvent({
        actorUserId: context.actorUserId,
        projectId: current.projectId,
        requestId: context.requestId,
        action: 'MILESTONE_UPDATED',
        resourceType: 'Milestone',
        resourceId: id,
        metadata: { milestoneId: id }
      })
    );
  },

  async updateMilestoneStatus(milestoneId, status, context = {}) {
    const id = parseMilestoneId(milestoneId);
    const current = await ensureMilestoneExists(id);
    await ensureMilestoneMutable(current);
    const nextStatus = ensureMilestoneStatus(status);
    return milestoneRepository.update(
      id,
      { status: nextStatus },
      buildAuditEvent({
        actorUserId: context.actorUserId,
        projectId: current.projectId,
        requestId: context.requestId,
        action: 'MILESTONE_STATUS_CHANGED',
        resourceType: 'Milestone',
        resourceId: id,
        metadata: { milestoneId: id }
      })
    );
  },

  async deleteMilestone(milestoneId, context = {}) {
    const id = parseMilestoneId(milestoneId);
    const milestone = await ensureMilestoneExists(id);
    await ensureMilestoneMutable(milestone);
    await milestoneRepository.delete(
      id,
      buildAuditEvent({
        actorUserId: context.actorUserId,
        projectId: milestone.projectId,
        requestId: context.requestId,
        action: 'MILESTONE_DELETED',
        resourceType: 'Milestone',
        resourceId: id,
        metadata: { milestoneId: id }
      })
    );
    return { id };
  }
};
