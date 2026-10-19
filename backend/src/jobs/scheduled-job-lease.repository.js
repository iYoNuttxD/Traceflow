import { prisma } from '../database/prismaClient.js';

export const scheduledJobLeaseRepository = {
  async acquire({ name, ownerId, now, leaseUntil }) {
    const taken = await prisma.scheduledJobLease.updateMany({
      where: { name, OR: [{ leaseUntil: { lte: now } }, { ownerId }] },
      data: { ownerId, acquiredAt: now, leaseUntil }
    });
    if (taken.count) return true;
    const created = await prisma.scheduledJobLease.createMany({
      data: [{ name, ownerId, acquiredAt: now, leaseUntil }],
      skipDuplicates: true
    });
    return created.count === 1;
  },

  async renew({ name, ownerId, leaseUntil }) {
    const renewed = await prisma.scheduledJobLease.updateMany({
      where: { name, ownerId },
      data: { leaseUntil }
    });
    return renewed.count === 1;
  },

  async release({ name, ownerId, now }) {
    await prisma.scheduledJobLease.updateMany({
      where: { name, ownerId },
      data: { leaseUntil: now }
    });
  }
};
