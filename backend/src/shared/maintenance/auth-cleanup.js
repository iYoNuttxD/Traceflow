import { env } from '../../config/env.js';
import { prisma } from '../../database/prismaClient.js';

const daysAgo = (days, now) => new Date(now.getTime() - days * 86400000);

export async function cleanupAuthRecords({ client = prisma, apply = false, now = new Date(), configuration = env } = {}) {
  const sessionCutoff = daysAgo(configuration.sessionRetentionDays, now);
  const resetCutoff = daysAgo(configuration.passwordResetRetentionDays, now);
  const invitationCutoff = daysAgo(configuration.invitationRetentionDays, now);
  const filters = {
    sessions: { OR: [{ expiresAt: { lt: sessionCutoff } }, { revokedAt: { lt: sessionCutoff } }] },
    passwordResetTokens: { OR: [{ expiresAt: { lt: resetCutoff } }, { usedAt: { lt: resetCutoff } }] },
    projectInvitations: { OR: [{ expiresAt: { lt: invitationCutoff } }, { revokedAt: { lt: invitationCutoff } }, { acceptedAt: { lt: invitationCutoff } }] }
  };
  const counts = {
    sessions: await client.session.count({ where: filters.sessions }),
    passwordResetTokens: await client.passwordResetToken.count({ where: filters.passwordResetTokens }),
    projectInvitations: await client.projectInvitation.count({ where: filters.projectInvitations })
  };
  if (apply) {
    await client.$transaction([
      client.session.deleteMany({ where: filters.sessions }),
      client.passwordResetToken.deleteMany({ where: filters.passwordResetTokens }),
      client.projectInvitation.deleteMany({ where: filters.projectInvitations })
    ]);
  }
  return { mode: apply ? 'apply' : 'dry-run', retentionDays: { sessions: configuration.sessionRetentionDays, passwordResetTokens: configuration.passwordResetRetentionDays, projectInvitations: configuration.invitationRetentionDays }, counts };
}
