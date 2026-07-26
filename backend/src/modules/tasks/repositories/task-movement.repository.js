import { prisma } from '../../../database/prismaClient.js';
import { auditRepository } from '../../audit/audit.repository.js';
import { taskInclude } from '../task.repository.js';

async function recalculateRequirement(tx, requirementId, calculateStatus) {
  if (!requirementId || !calculateStatus) return;
  const requirement = await tx.requirement.findUnique({
    where: { id: requirementId },
    select: { status: true, tasks: { select: { status: true } } }
  });
  if (!requirement || ['CONCLUIDO', 'CANCELADO'].includes(requirement.status)) return;
  const status = calculateStatus(requirement.tasks);
  if (status !== requirement.status) {
    await tx.requirement.update({ where: { id: requirementId }, data: { status } });
  }
}

function movementWhere(projectId, filters = {}) {
  return {
    projectId,
    ...(filters.movedAt ? { movedAt: filters.movedAt } : {}),
    ...(filters.taskId ? { taskId: filters.taskId } : {}),
    ...(filters.actorUserId ? { movedByUserId: filters.actorUserId } : {}),
    ...(filters.movedBy ? { movedBy: filters.movedBy } : {}),
    ...(filters.sprintId ? { sprintId: filters.sprintId } : {})
  };
}

export const taskMovementRepository = {
  async transitionStatus({ task, toStatus, actor, auditEvent, calculateRequirementStatus }) {
    return prisma.$transaction(async (tx) => {
      const changed = await tx.task.updateMany({
        where: { id: task.id, projectId: task.projectId, status: task.status },
        data: { status: toStatus }
      });
      if (changed.count !== 1) return { conflict: true };

      const movement = await tx.taskMovement.create({
        data: {
          projectId: task.projectId,
          taskId: task.id,
          fromStatus: task.status,
          toStatus,
          movedBy: actor.name,
          movedByUserId: actor.id,
          projectMemberId: null
        },
        include: { movedByUser: { select: { id: true, name: true } } }
      });
      await tx.taskHistoryEntry.create({
        data: {
          projectId: task.projectId,
          taskId: task.id,
          actorUserId: actor.id,
          field: 'STATUS',
          fromValue: task.status,
          toValue: toStatus,
          occurredAt: movement.movedAt
        }
      });
      await recalculateRequirement(tx, task.requirementId, calculateRequirementStatus);
      if (auditEvent) await auditRepository.create(auditEvent, tx);
      const updatedTask = await tx.task.findUnique({
        where: { id: task.id },
        include: taskInclude
      });
      return { task: updatedTask, movement };
    });
  },

  listPage(projectId, filters, pagination) {
    const where = movementWhere(projectId, filters);
    return prisma.$transaction([
      prisma.taskMovement.count({ where }),
      prisma.taskMovement.findMany({
        where,
        include: {
          task: { select: { title: true } },
          movedByUser: { select: { id: true, name: true } }
        },
        orderBy: [{ movedAt: 'desc' }, { id: 'desc' }],
        skip: pagination.skip,
        take: pagination.take
      })
    ]);
  },

  count(projectId, filters) {
    return prisma.taskMovement.count({ where: movementWhere(projectId, filters) });
  }
};
