import { prisma } from '../../database/prismaClient.js';
import { auditRepository } from '../audit/audit.repository.js';

const suggestionSelect = {
  id: true,
  projectId: true,
  taskId: true,
  commitId: true,
  status: true,
  detectedAt: true,
  reviewedAt: true,
  reviewedByUserId: true,
  task: { select: { id: true, title: true, status: true } },
  commit: { select: { id: true, hash: true, message: true, date: true } }
};

export const commitSuggestionRepository = {
  findProjectById(projectId) {
    return prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  },

  findTasksByProjectAndIds(projectId, taskIds) {
    return prisma.task.findMany({
      where: { projectId, id: { in: taskIds } },
      select: { id: true }
    });
  },

  findTaskByProjectAndId(projectId, taskId) {
    return prisma.task.findFirst({
      where: { id: taskId, projectId },
      select: { id: true }
    });
  },

  findExistingTaskCommitPairs(taskIds, commitIds) {
    return prisma.taskCommit.findMany({
      where: { taskId: { in: taskIds }, commitId: { in: commitIds } },
      select: { taskId: true, commitId: true }
    });
  },

  findExistingSuggestionPairs(taskIds, commitIds) {
    return prisma.taskCommitSuggestion.findMany({
      where: { taskId: { in: taskIds }, commitId: { in: commitIds } },
      select: { taskId: true, commitId: true, status: true }
    });
  },

  createMany(suggestions) {
    if (suggestions.length === 0) return { count: 0 };
    return prisma.taskCommitSuggestion.createMany({ data: suggestions, skipDuplicates: true });
  },

  findCommitPage(projectId, { cursor, take }) {
    return prisma.commit.findMany({
      where: { projectId },
      select: { id: true, projectId: true, message: true },
      orderBy: { id: 'asc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take
    });
  },

  async list(projectId, { status, taskId, skip, take }) {
    const where = { projectId, status, ...(taskId ? { taskId } : {}) };
    const [total, suggestions] = await prisma.$transaction([
      prisma.taskCommitSuggestion.count({ where }),
      prisma.taskCommitSuggestion.findMany({
        where,
        select: suggestionSelect,
        orderBy: [{ detectedAt: 'desc' }, { id: 'desc' }],
        skip,
        take
      })
    ]);
    return { total, suggestions };
  },

  findByProjectAndId(projectId, suggestionId) {
    return prisma.taskCommitSuggestion.findFirst({
      where: { id: suggestionId, projectId },
      select: { id: true, taskId: true, commitId: true, status: true }
    });
  },

  async confirm({ projectId, suggestionId, userId, reviewedAt, auditEvent }) {
    return prisma.$transaction(async (tx) => {
      const suggestion = await tx.taskCommitSuggestion.findFirst({
        where: { id: suggestionId, projectId },
        select: {
          ...suggestionSelect,
          task: { select: { id: true, projectId: true, title: true, status: true } },
          commit: { select: { id: true, projectId: true, hash: true, message: true, date: true } }
        }
      });
      if (!suggestion) return { outcome: 'NOT_FOUND' };
      if (suggestion.task.projectId !== projectId || suggestion.commit.projectId !== projectId) {
        return { outcome: 'PROJECT_MISMATCH' };
      }
      if (suggestion.status === 'CONFIRMED') return { outcome: 'UNCHANGED', suggestion };
      if (suggestion.status !== 'PENDING') return { outcome: 'INVALID_STATUS', suggestion };

      await tx.taskCommit.upsert({
        where: { taskId_commitId: { taskId: suggestion.taskId, commitId: suggestion.commitId } },
        create: { taskId: suggestion.taskId, commitId: suggestion.commitId },
        update: {}
      });
      const update = await tx.taskCommitSuggestion.updateMany({
        where: { id: suggestionId, projectId, status: 'PENDING' },
        data: { status: 'CONFIRMED', reviewedAt, reviewedByUserId: userId }
      });
      if (update.count === 0) {
        const current = await tx.taskCommitSuggestion.findUnique({
          where: { id: suggestionId },
          select: suggestionSelect
        });
        return {
          outcome: current?.status === 'CONFIRMED' ? 'UNCHANGED' : 'INVALID_STATUS',
          suggestion: current
        };
      }
      await auditRepository.create(auditEvent, tx);
      return {
        outcome: 'UPDATED',
        suggestion: await tx.taskCommitSuggestion.findUnique({
          where: { id: suggestionId },
          select: suggestionSelect
        })
      };
    });
  },

  async reject({ projectId, suggestionId, userId, reviewedAt, auditEvent }) {
    return prisma.$transaction(async (tx) => {
      const suggestion = await tx.taskCommitSuggestion.findFirst({
        where: { id: suggestionId, projectId },
        select: {
          ...suggestionSelect,
          task: { select: { id: true, projectId: true, title: true, status: true } },
          commit: { select: { id: true, projectId: true, hash: true, message: true, date: true } }
        }
      });
      if (!suggestion) return { outcome: 'NOT_FOUND' };
      if (suggestion.task.projectId !== projectId || suggestion.commit.projectId !== projectId) {
        return { outcome: 'PROJECT_MISMATCH' };
      }
      if (suggestion.status === 'REJECTED') return { outcome: 'UNCHANGED', suggestion };
      if (suggestion.status !== 'PENDING') return { outcome: 'INVALID_STATUS', suggestion };

      const update = await tx.taskCommitSuggestion.updateMany({
        where: { id: suggestionId, projectId, status: 'PENDING' },
        data: { status: 'REJECTED', reviewedAt, reviewedByUserId: userId }
      });
      if (update.count === 0) {
        const current = await tx.taskCommitSuggestion.findUnique({
          where: { id: suggestionId },
          select: suggestionSelect
        });
        return {
          outcome: current?.status === 'REJECTED' ? 'UNCHANGED' : 'INVALID_STATUS',
          suggestion: current
        };
      }
      await auditRepository.create(auditEvent, tx);
      return {
        outcome: 'UPDATED',
        suggestion: await tx.taskCommitSuggestion.findUnique({
          where: { id: suggestionId },
          select: suggestionSelect
        })
      };
    });
  }
};
