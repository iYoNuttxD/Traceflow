import { sprintRepository } from '../repositories/sprint.repository.js';
import { buildAuditEvent } from '../../audit/audit.service.js';
import { ERROR_CODES } from '../../../shared/errors/index.js';
import {
  SprintServiceError,
  isTerminalSprintStatus,
  parseSprintId,
  sprintNotFoundError
} from '../sprint.schema.js';

export const sprintDeletionService = {
  async deleteSprint(sprintId, context = {}) {
    const id = parseSprintId(sprintId);
    // Including a tombstone is explicit and only permits a coherent duplicate-delete conflict.
    const current = await sprintRepository.findById(id, { includeDeleted: true });
    if (!current) throw sprintNotFoundError();
    const result = await sprintRepository.softDeleteWithinSprintLock(
      id,
      current.projectId,
      ({ sprint, tasks }) => {
        if (sprint.deletedAt)
          throw new SprintServiceError(
            'Esta sprint já foi excluída.',
            409,
            ERROR_CODES.SPRINT_ALREADY_DELETED
          );
        return {
          data: { deletedAt: new Date(), deletedById: context.actorUserId ?? null },
          closeOpenMemberships: !isTerminalSprintStatus(sprint.status),
          historyEntries: tasks.map((task) => ({
            projectId: sprint.projectId,
            taskId: task.id,
            actorUserId: context.actorUserId,
            field: 'SPRINT',
            fromValue: String(id),
            toValue: null
          })),
          auditEvent: buildAuditEvent({
            actorUserId: context.actorUserId,
            projectId: sprint.projectId,
            requestId: context.requestId,
            action: 'SPRINT_DELETED',
            resourceType: 'Sprint',
            resourceId: id,
            metadata: { sprintId: id, count: tasks.length }
          })
        };
      }
    );
    if (!result) throw sprintNotFoundError();
    return result;
  }
};
