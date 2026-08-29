import { prisma } from '../../../database/prismaClient.js';
import { auditRepository } from '../../audit/audit.repository.js';

const commentSelect = {
  id: true,
  taskId: true,
  authorUserId: true,
  content: true,
  editedAt: true,
  createdAt: true,
  authorUser: { select: { id: true, name: true } }
};

export const taskCommentRepository = {
  listPage(taskId, pagination) {
    const where = { taskId, deletedAt: null };
    return prisma.$transaction([
      prisma.taskComment.count({ where }),
      prisma.taskComment.findMany({
        where,
        select: commentSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: pagination.skip,
        take: pagination.take
      })
    ]);
  },

  findActiveById(taskId, commentId) {
    return prisma.taskComment.findFirst({
      where: { id: commentId, taskId, deletedAt: null },
      select: commentSelect
    });
  },

  async createAtomic(data, auditEvent) {
    return prisma.$transaction(async (tx) => {
      const comment = await tx.taskComment.create({ data, select: commentSelect });
      if (auditEvent)
        await auditRepository.create({ ...auditEvent, resourceId: String(comment.id) }, tx);
      return comment;
    });
  },

  // O update condicional protege contra exclusão concorrente: sem linha afetada,
  // nada é alterado e a auditoria não é registrada.
  async updateContentAtomic(taskId, commentId, content, auditEvent) {
    return prisma.$transaction(async (tx) => {
      const result = await tx.taskComment.updateMany({
        where: { id: commentId, taskId, deletedAt: null },
        data: { content, editedAt: new Date() }
      });
      if (result.count === 0) return { outcome: 'NOT_FOUND' };
      const comment = await tx.taskComment.findUnique({
        where: { id: commentId },
        select: commentSelect
      });
      if (auditEvent) await auditRepository.create(auditEvent, tx);
      return { outcome: 'UPDATED', comment };
    });
  },

  async softDeleteAtomic(taskId, commentId, deletedById, auditEvent) {
    return prisma.$transaction(async (tx) => {
      const result = await tx.taskComment.updateMany({
        where: { id: commentId, taskId, deletedAt: null },
        data: { deletedAt: new Date(), deletedById }
      });
      if (result.count === 0) return { outcome: 'NOT_FOUND' };
      if (auditEvent) await auditRepository.create(auditEvent, tx);
      return { outcome: 'DELETED' };
    });
  }
};
