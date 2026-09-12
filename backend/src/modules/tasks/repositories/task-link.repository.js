import { traceabilityTransaction } from '../../traceability/requirement-reconciliation.repository.js';
import { prisma } from '../../../database/prismaClient.js';
import { auditRepository } from '../../audit/audit.repository.js';
import { taskInclude } from '../task.repository.js';

export const taskLinkRepository = {
  async setRequirement(task, requirementId, auditEvent) {
    return traceabilityTransaction(
      {
        projectId: task.projectId,
        taskIds: [task.id],
        requirementIds: [task.requirementId, requirementId],
        reason: 'TASK_REQUIREMENT_CHANGED',
        sourceEntityType: 'Task',
        sourceEntityId: task.id
      },
      async (tx) => {
        const updated = await tx.task.update({
          where: { id: task.id },
          data: { requirementId },
          include: taskInclude
        });
        if (auditEvent) await auditRepository.create(auditEvent, tx);
        return updated;
      }
    );
  },
  // Transacao unica: atualiza Task.sprintId, grava o historico funcional (RF38)
  // e o evento de auditoria no mesmo escopo. Falha em qualquer etapa desfaz tudo.
  async setSprint(task, sprintId, { historyEntry, auditEvent } = {}) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: task.id },
        data: { sprintId },
        include: taskInclude
      });
      if (historyEntry) await tx.taskHistoryEntry.create({ data: historyEntry });
      if (auditEvent) await auditRepository.create(auditEvent, tx);
      return updated;
    });
  },
  async setPullRequest(taskId, pullRequestId, auditEvent) {
    return traceabilityTransaction(
      {
        taskIds: [taskId],
        reason: 'TECHNICAL_EVIDENCE_CHANGED',
        sourceEntityType: 'Task',
        sourceEntityId: taskId
      },
      async (tx) => {
        const task = await tx.task.update({
          where: { id: taskId },
          data: { pullRequestId },
          include: taskInclude
        });
        if (auditEvent) await auditRepository.create(auditEvent, tx);
        return task;
      }
    );
  },
  async createCommit(taskId, commitId, auditEvent) {
    return traceabilityTransaction(
      {
        taskIds: [taskId],
        reason: 'TECHNICAL_EVIDENCE_CHANGED',
        sourceEntityType: 'Task',
        sourceEntityId: taskId
      },
      async (tx) => {
        const link = await tx.taskCommit.create({ data: { taskId, commitId } });
        if (auditEvent) await auditRepository.create(auditEvent, tx);
        return link;
      }
    );
  },
  async deleteCommit(taskId, commitId, auditEvent) {
    return traceabilityTransaction(
      {
        taskIds: [taskId],
        reason: 'TECHNICAL_EVIDENCE_CHANGED',
        sourceEntityType: 'Task',
        sourceEntityId: taskId
      },
      async (tx) => {
        await tx.taskCommit.delete({ where: { taskId_commitId: { taskId, commitId } } });
        if (auditEvent) await auditRepository.create(auditEvent, tx);
      }
    );
  },
  async createIssue(taskId, issueId, auditEvent) {
    return traceabilityTransaction(
      {
        taskIds: [taskId],
        reason: 'TECHNICAL_EVIDENCE_CHANGED',
        sourceEntityType: 'Task',
        sourceEntityId: taskId
      },
      async (tx) => {
        const link = await tx.taskIssue.create({ data: { taskId, issueId } });
        if (auditEvent) await auditRepository.create(auditEvent, tx);
        return link;
      }
    );
  },
  async deleteIssue(taskId, issueId, auditEvent) {
    return traceabilityTransaction(
      {
        taskIds: [taskId],
        reason: 'TECHNICAL_EVIDENCE_CHANGED',
        sourceEntityType: 'Task',
        sourceEntityId: taskId
      },
      async (tx) => {
        await tx.taskIssue.delete({ where: { taskId_issueId: { taskId, issueId } } });
        if (auditEvent) await auditRepository.create(auditEvent, tx);
      }
    );
  }
};
