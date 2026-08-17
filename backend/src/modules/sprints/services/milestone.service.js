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

export const milestoneService = {
  async createMilestone(projectId, data, context = {}) {
    const parsedProjectId = parseProjectId(projectId);
    await ensureProjectExists(parsedProjectId);
    const milestoneData = buildMilestoneData(data, true);
    await ensureMilestoneSprint(milestoneData.sprintId, parsedProjectId, context);
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
    if (milestoneData.sprintId !== undefined) {
      await ensureMilestoneSprint(milestoneData.sprintId, current.projectId, context);
    }
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
