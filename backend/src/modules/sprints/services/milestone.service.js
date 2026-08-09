// Casos de uso de marcos do cronograma (RF10).
// Marco pertence ao projeto, nao a sprint: escopo suficiente para o criterio de aceite
// e extensivel depois sem quebra de contrato.
import { milestoneRepository } from '../repositories/milestone.repository.js';
import { buildAuditEvent } from '../../audit/audit.service.js';
import {
  buildMilestoneData,
  ensureAtLeastOneField,
  ensureMilestoneStatus,
  milestoneNotFoundError,
  parseMilestoneId,
  parseProjectId
} from '../sprint.schema.js';
import { ensureProjectExists } from './sprint-crud.service.js';

export async function ensureMilestoneExists(milestoneId) {
  const milestone = await milestoneRepository.findById(milestoneId);
  if (!milestone) throw milestoneNotFoundError();
  return milestone;
}

export const milestoneService = {
  async createMilestone(projectId, data, context = {}) {
    const parsedProjectId = parseProjectId(projectId);
    await ensureProjectExists(parsedProjectId);
    const milestoneData = buildMilestoneData(data, true);
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
