import { prisma } from '../../../database/prismaClient.js';
import { auditRepository } from '../../audit/audit.repository.js';
import { taskInclude } from '../task.repository.js';

async function recalculateRequirements(tx, requirementIds, calculateStatus) {
  const ids = [...new Set(requirementIds.filter(Boolean))];
  if (!ids.length) return;
  const requirements = await tx.requirement.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true, tasks: { select: { status: true } } }
  });
  for (const requirement of requirements) {
    if (['CONCLUIDO', 'CANCELADO'].includes(requirement.status)) continue;
    const status = calculateStatus(requirement.tasks);
    if (status !== requirement.status) {
      await tx.requirement.update({ where: { id: requirement.id }, data: { status } });
    }
  }
}

export const taskLinkRepository = {
  async setRequirement(task, requirementId, auditEvent, calculateStatus) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: task.id },
        data: { requirementId },
        include: taskInclude
      });
      await recalculateRequirements(tx, [task.requirementId, requirementId], calculateStatus);
      if (auditEvent) await auditRepository.create(auditEvent, tx);
      return updated;
    });
  },
  async setPullRequest(taskId, pullRequestId, auditEvent) {
    return prisma.$transaction(async (tx) => {
      const task = await tx.task.update({
        where: { id: taskId },
        data: { pullRequestId },
        include: taskInclude
      });
      if (auditEvent) await auditRepository.create(auditEvent, tx);
      return task;
    });
  },
  async createCommit(taskId, commitId, auditEvent) {
    return prisma.$transaction(async (tx) => {
      const link = await tx.taskCommit.create({ data: { taskId, commitId } });
      if (auditEvent) await auditRepository.create(auditEvent, tx);
      return link;
    });
  },
  async deleteCommit(taskId, commitId, auditEvent) {
    return prisma.$transaction(async (tx) => {
      await tx.taskCommit.delete({ where: { taskId_commitId: { taskId, commitId } } });
      if (auditEvent) await auditRepository.create(auditEvent, tx);
    });
  },
  async createIssue(taskId, issueId, auditEvent) {
    return prisma.$transaction(async (tx) => {
      const link = await tx.taskIssue.create({ data: { taskId, issueId } });
      if (auditEvent) await auditRepository.create(auditEvent, tx);
      return link;
    });
  },
  async deleteIssue(taskId, issueId, auditEvent) {
    return prisma.$transaction(async (tx) => {
      await tx.taskIssue.delete({ where: { taskId_issueId: { taskId, issueId } } });
      if (auditEvent) await auditRepository.create(auditEvent, tx);
    });
  }
};
