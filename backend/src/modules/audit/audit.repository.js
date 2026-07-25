import { prisma } from '../../database/prismaClient.js';

const publicSelect = {
  id: true, occurredAt: true, actorType: true, actorUserId: true, projectId: true,
  action: true, resourceType: true, resourceId: true, result: true,
  reasonCode: true, requestId: true, metadataJson: true
};

export const auditRepository = {
  create(data, client = prisma) { return client.auditEvent.create({ data }); },
  list({ where, skip, take }) {
    return prisma.$transaction([
      prisma.auditEvent.count({ where }),
      prisma.auditEvent.findMany({ where, select: publicSelect, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], skip, take })
    ]);
  },
  findMembership(projectId, userId) {
    return prisma.projectMembership.findUnique({ where: { projectId_userId: { projectId, userId } } });
  }
};
