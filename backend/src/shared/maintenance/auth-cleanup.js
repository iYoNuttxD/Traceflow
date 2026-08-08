import { env } from '../../config/env.js';
import { prisma } from '../../database/prismaClient.js';

const daysAgo = (days, now) => new Date(now.getTime() - days * 86400000);

export async function cleanupAuthRecords({
  client = prisma,
  apply = false,
  now = new Date(),
  configuration = env
} = {}) {
  const sessionCutoff = daysAgo(configuration.sessionRetentionDays, now);
  const resetCutoff = daysAgo(configuration.passwordResetRetentionDays, now);
  const invitationCutoff = daysAgo(configuration.invitationRetentionDays, now);
  const emailVerificationCutoff = daysAgo(configuration.emailVerificationRetentionDays, now);
  const githubConnectionStateCutoff = daysAgo(
    configuration.githubConnectionStateRetentionDays,
    now
  );
  const githubWebhookDeliveryCutoff = daysAgo(
    configuration.githubWebhookDeliveryRetentionDays,
    now
  );
  const filters = {
    sessions: { OR: [{ expiresAt: { lt: sessionCutoff } }, { revokedAt: { lt: sessionCutoff } }] },
    passwordResetTokens: {
      OR: [{ expiresAt: { lt: resetCutoff } }, { usedAt: { lt: resetCutoff } }]
    },
    projectInvitations: {
      OR: [
        { expiresAt: { lt: invitationCutoff } },
        { revokedAt: { lt: invitationCutoff } },
        { acceptedAt: { lt: invitationCutoff } }
      ]
    },
    emailVerificationTokens: {
      OR: [
        { expiresAt: { lt: emailVerificationCutoff } },
        { usedAt: { lt: emailVerificationCutoff } }
      ]
    },
    githubConnectionStates: {
      OR: [
        { expiresAt: { lt: githubConnectionStateCutoff } },
        { usedAt: { lt: githubConnectionStateCutoff } }
      ]
    },
    githubOAuthStates: {
      OR: [
        { expiresAt: { lt: githubConnectionStateCutoff } },
        { usedAt: { lt: githubConnectionStateCutoff } }
      ]
    },
    githubWebhookDeliveries: { receivedAt: { lt: githubWebhookDeliveryCutoff } }
  };
  const counts = {
    sessions: await client.session.count({ where: filters.sessions }),
    passwordResetTokens: await client.passwordResetToken.count({
      where: filters.passwordResetTokens
    }),
    projectInvitations: await client.projectInvitation.count({ where: filters.projectInvitations }),
    emailVerificationTokens: await client.emailVerificationToken.count({
      where: filters.emailVerificationTokens
    }),
    githubConnectionStates: await client.gitHubAppConnectionState.count({
      where: filters.githubConnectionStates
    }),
    githubOAuthStates: await client.gitHubOAuthState.count({ where: filters.githubOAuthStates }),
    githubWebhookDeliveries: await client.gitHubWebhookDelivery.count({
      where: filters.githubWebhookDeliveries
    })
  };
  if (apply) {
    await client.$transaction([
      client.gitHubAppConnectionState.deleteMany({ where: filters.githubConnectionStates }),
      client.gitHubOAuthState.deleteMany({ where: filters.githubOAuthStates }),
      client.session.deleteMany({ where: filters.sessions }),
      client.emailVerificationToken.deleteMany({ where: filters.emailVerificationTokens }),
      client.passwordResetToken.deleteMany({ where: filters.passwordResetTokens }),
      client.projectInvitation.deleteMany({ where: filters.projectInvitations }),
      client.gitHubWebhookDelivery.deleteMany({ where: filters.githubWebhookDeliveries })
    ]);
  }
  return {
    mode: apply ? 'apply' : 'dry-run',
    retentionDays: {
      sessions: configuration.sessionRetentionDays,
      passwordResetTokens: configuration.passwordResetRetentionDays,
      projectInvitations: configuration.invitationRetentionDays,
      emailVerificationTokens: configuration.emailVerificationRetentionDays,
      githubConnectionStates: configuration.githubConnectionStateRetentionDays,
      githubOAuthStates: configuration.githubConnectionStateRetentionDays,
      githubWebhookDeliveries: configuration.githubWebhookDeliveryRetentionDays
    },
    counts
  };
}
