import { ERROR_CODES } from '../../../shared/errors/index.js';
import { milestoneRepository } from '../repositories/milestone.repository.js';
import { buildAuditEvent } from '../../audit/audit.service.js';
import {
  buildMilestoneData,
  ensureAtLeastOneField,
  ensureMilestoneStatus,
  SprintServiceError,
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

    return milestoneRepository.createWithinProjectLock(
      parsedProjectId,
      milestoneData,
      buildAuditEvent({
        actorUserId: context.actorUserId,
        projectId: parsedProjectId,
        requestId: context.requestId,
        action: 'MILESTONE_CREATED',
        resourceType: 'Milestone'
      }),
      () => {}
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

    const milestone = await milestoneRepository.updateWithinProjectLock(
      id,
      current.projectId,
      milestoneData,
      buildAuditEvent({
        actorUserId: context.actorUserId,
        projectId: current.projectId,
        requestId: context.requestId,
        action: 'MILESTONE_UPDATED',
        resourceType: 'Milestone',
        resourceId: id,
        metadata: { milestoneId: id }
      }),
      () => {}
    );

    if (milestone === null) throw milestoneNotFoundError();
    return milestone;
  },

  async updateMilestoneStatus(milestoneId, status, context = {}) {
    const id = parseMilestoneId(milestoneId);
    const current = await ensureMilestoneExists(id);
    const nextStatus = ensureMilestoneStatus(status);

    const milestone = await milestoneRepository.updateWithinProjectLock(
      id,
      current.projectId,
      { status: nextStatus },
      buildAuditEvent({
        actorUserId: context.actorUserId,
        projectId: current.projectId,
        requestId: context.requestId,
        action: 'MILESTONE_STATUS_CHANGED',
        resourceType: 'Milestone',
        resourceId: id,
        metadata: { milestoneId: id }
      }),
      () => {}
    );

    if (milestone === null) throw milestoneNotFoundError();
    return milestone;
  },

  async deleteMilestone(milestoneId, context = {}) {
    const id = parseMilestoneId(milestoneId);
    const current = await milestoneRepository.findById(id, { includeDeleted: true });
    if (!current) throw milestoneNotFoundError();

    const removido = await milestoneRepository.deleteWithinProjectLock(
      id,
      current.projectId,
      buildAuditEvent({
        actorUserId: context.actorUserId,
        projectId: current.projectId,
        requestId: context.requestId,
        action: 'MILESTONE_DELETED',
        resourceType: 'Milestone',
        resourceId: id,
        metadata: { milestoneId: id }
      }),
      ({ milestone }) => {
        if (milestone.deletedAt)
          throw new SprintServiceError(
            'Este marco já foi excluído.',
            409,
            ERROR_CODES.MILESTONE_ALREADY_DELETED
          );
      }
    );

    if (removido === null) throw milestoneNotFoundError();
    return removido;
  }
};
