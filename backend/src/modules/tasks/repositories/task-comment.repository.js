import { prisma } from '../../../database/prismaClient.js';
import { auditRepository } from '../../audit/audit.repository.js';

const commentSelect = {
  id: true,
  taskId: true,
  authorUserId: true,
  content: true,
  editedAt: true,
  deletedAt: true,
  deletedById: true,
  createdAt: true,
  authorUser: { select: { id: true, name: true } }
};

export const taskCommentRepository = {
  // A listagem inclui comentários excluídos para preservar a linha do tempo do RF31;
  // o service converte cada exclusão em marcador sem conteúdo antes de responder.
  listCursor(taskId, { before, limit }) {
    return prisma.taskComment.findMany({
      where: {
        taskId,
        ...(before
          ? {
              OR: [
                { createdAt: { lt: before.createdAt } },
                { createdAt: before.createdAt, id: { lt: before.id } }
              ]
            }
          : {})
      },
      select: commentSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1
    });
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
      const comment = await tx.taskComment.findUnique({
        where: { id: commentId },
        select: commentSelect
      });
      if (auditEvent) await auditRepository.create(auditEvent, tx);
      return { outcome: 'DELETED', comment };
    });
  }
};
