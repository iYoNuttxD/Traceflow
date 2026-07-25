import { env } from '../../config/env.js';
import { prisma } from '../../database/prismaClient.js';

const daysAgo = (days, now) => new Date(now.getTime() - days * 86400000);

export async function runPrivacyRetention({ client = prisma, apply = false, now = new Date(), configuration = env } = {}) {
  const filters = {
    auditEvents: { retentionUntil: { lt: now } },
    privacyRequests: { status: { in: ['COMPLETED', 'CANCELLED', 'REJECTED'] }, updatedAt: { lt: daysAgo(configuration.privacyRequestRetentionDays, now) } },
    personalDataExports: { expiresAt: { lt: now } }
  };
  const counts = {
    auditEvents: await client.auditEvent.count({ where: filters.auditEvents }),
    privacyRequests: await client.privacyRequest.count({ where: filters.privacyRequests }),
    personalDataExports: await client.personalDataExport.count({ where: filters.personalDataExports })
  };
  if (apply) {
    await client.$transaction(async (tx) => {
      await tx.auditEvent.deleteMany({ where: filters.auditEvents });
      await tx.privacyRequest.deleteMany({ where: filters.privacyRequests });
      await tx.personalDataExport.deleteMany({ where: filters.personalDataExports });
      await tx.auditEvent.create({ data: {
        actorType: 'SYSTEM', action: 'RETENTION_CLEANUP_EXECUTED', resourceType: 'Maintenance',
        result: 'SUCCESS', metadataJson: { count: Object.values(counts).reduce((sum, count) => sum + count, 0) },
        retentionUntil: new Date(now.getTime() + configuration.auditRetentionDays * 86400000)
      } });
    });
  }
  return { mode: apply ? 'apply' : 'dry-run', counts };
}
