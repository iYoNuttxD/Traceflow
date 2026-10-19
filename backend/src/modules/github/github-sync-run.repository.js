import { prisma } from '../../database/prismaClient.js';
import { recoveryPrisma, recoveryTransaction } from '../../database/recovery-prisma.js';

const activeStatuses = ['QUEUED', 'RUNNING'];

import {
  isProjectWriteBusy,
  lockActiveProject,
  withActiveProjectWrite
} from '../projects/active-project-write.js';
import { assertProjectWriteGuard } from '../projects/project-write-context.js';
import { ProjectServiceError } from '../projects/project.schema.js';
import {
  distributedSyncAt,
  eligibleIntegration,
  nextSyncAfterRun,
  syncSchedulePolicy
} from './github-sync-schedule.js';

const leaseLost = () =>
  new ProjectServiceError('A execução não está mais ativa.', 409, 'GITHUB_SYNC_LEASE_LOST');

function failedRun({ errorCode, errorMessage, finishedAt, durationMs }) {
  return {
    status: 'FAILED',
    activeProjectId: null,
    heartbeatAt: finishedAt,
    finishedAt,
    durationMs,
    errorCode,
    errorMessage,
    automaticSlot: null,
    automaticInstallationId: null
  };
}

// Coordination never waits behind a long Project writer. Each next tick/progress
// call gets a fresh transaction; BUSY is distinct from inactive/lost authority.
async function withSyncWrite(projectId, write, { busyResult, inactiveResult } = {}) {
  try {
    return await withActiveProjectWrite(projectId, write, { nowait: true, inactiveResult });
  } catch (error) {
    if (!isProjectWriteBusy(error)) throw error;
    if (busyResult !== undefined) return busyResult;
    throw new ProjectServiceError(
      'O projeto está ocupado. Tente novamente em instantes.',
      503,
      'GITHUB_SYNC_BUSY'
    );
  }
}

async function lockedRun(tx, id) {
  const rows = await tx.$queryRaw`SELECT * FROM GitHubSyncRun WHERE id = ${id} FOR UPDATE NOWAIT`;
  return rows[0] || null;
}
function ownsLease(run, now, policy = syncSchedulePolicy()) {
  return (
    run?.status === 'RUNNING' &&
    run.activeProjectId === run.projectId &&
    (run.heartbeatAt || run.updatedAt).getTime() >= now.getTime() - policy.leaseMs
  );
}

async function updateOwnedRun(
  id,
  data,
  { now = new Date(), terminal = false, retryAt, permanent = false } = {}
) {
  const found = await prisma.gitHubSyncRun.findUnique({ where: { id } });
  if (!found) return false;
  return withSyncWrite(
    found.projectId,
    async (tx) => {
      const run = await lockedRun(tx, id);
      if (!ownsLease(run, now)) return false;
      if (terminal)
        await reschedule(tx, run, now, { failed: data.status === 'FAILED', retryAt, permanent });
      await tx.gitHubSyncRun.update({
        where: { id },
        data: {
          ...data,
          ...(terminal ? { automaticSlot: null, automaticInstallationId: null } : {})
        }
      });
      return true;
    },
    { inactiveResult: false, ...(!terminal && { busyResult: null }) }
  );
}

async function reschedule(tx, run, now, { failed, retryAt, permanent = false }) {
  const integration = await tx.projectGitHubIntegration.findUnique({
    where: { projectId: run.projectId },
    include: { installation: true, project: true }
  });
  if (!integration) return;
  const failures = failed ? Math.min(integration.consecutiveSyncFailures + 1, 10) : 0;
  if (retryAt && integration.installationId) {
    await tx.gitHubInstallation.updateMany({
      where: {
        id: integration.installationId,
        OR: [{ syncNotBefore: null }, { syncNotBefore: { lt: retryAt } }]
      },
      data: { syncNotBefore: retryAt }
    });
  }
  const cooldown = new Date(
    Math.max(retryAt?.getTime() || 0, integration.installation?.syncNotBefore?.getTime() || 0)
  );
  await tx.projectGitHubIntegration.update({
    where: { projectId: run.projectId },
    data: {
      consecutiveSyncFailures: failures,
      ...(permanent ? { status: 'RECONNECT_REQUIRED' } : {}),
      nextSyncAt:
        eligibleIntegration(integration) && !permanent
          ? nextSyncAfterRun(run.projectId, now, failures, cooldown)
          : null
    }
  });
}

export const githubSyncRunRepository = {
  create(projectId, requestedByUserId) {
    return withSyncWrite(projectId, async (tx) => {
      const integration = await tx.projectGitHubIntegration.findUnique({
        where: { projectId },
        include: { installation: true }
      });
      if (integration?.status !== 'ACTIVE' || integration.installation?.status !== 'ACTIVE')
        throw new ProjectServiceError(
          'Reconecte a GitHub App antes de sincronizar este projeto.',
          409
        );
      if (integration.installation.syncNotBefore > new Date()) {
        const error = new ProjectServiceError(
          'Aguarde a liberação do limite de requisições do GitHub.',
          429,
          'GITHUB_RATE_LIMITED'
        );
        error.retryAt = integration.installation.syncNotBefore;
        throw error;
      }
      const run = await tx.gitHubSyncRun.create({
        data: { projectId, requestedByUserId, activeProjectId: projectId }
      });
      await tx.projectGitHubIntegration.update({
        where: { projectId },
        data: { nextSyncAt: null }
      });
      return run;
    });
  },

  async assertLease(tx, id, projectId, now = new Date()) {
    const run = await lockedRun(tx, id);
    if (run?.projectId !== projectId || !ownsLease(run, now)) throw leaseLost();
  },

  findById(id) {
    return prisma.gitHubSyncRun.findUnique({ where: { id } });
  },

  findActive(projectId) {
    return prisma.gitHubSyncRun.findFirst({
      where: { projectId, activeProjectId: projectId, status: { in: activeStatuses } },
      orderBy: { createdAt: 'desc' }
    });
  },

  findLatest(projectId) {
    return prisma.gitHubSyncRun.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'desc' }
    });
  },

  async claim(id, now = new Date()) {
    const found = await this.findById(id);
    if (!found) return false;
    return withSyncWrite(
      found.projectId,
      async (tx) => {
        const run = await lockedRun(tx, id);
        if (run?.status !== 'QUEUED' || run.activeProjectId !== run.projectId) return false;
        const integration = await tx.projectGitHubIntegration.findUnique({
          where: { projectId: run.projectId },
          include: { installation: true, project: true }
        });
        // Disabling before claim prevents a queued automatic job from starting.
        if (
          !integration ||
          integration.status !== 'ACTIVE' ||
          integration.installation?.status !== 'ACTIVE' ||
          (run.origin === 'AUTOMATIC' && !eligibleIntegration(integration)) ||
          integration.installation?.syncNotBefore > now
        ) {
          await tx.gitHubSyncRun.update({
            where: { id },
            data: {
              status: 'FAILED',
              activeProjectId: null,
              automaticSlot: null,
              automaticInstallationId: null,
              finishedAt: now,
              errorCode: 'GITHUB_SYNC_INELIGIBLE',
              errorMessage: 'A integração não está disponível para esta execução.'
            }
          });
          await reschedule(tx, run, now, { failed: false });
          return false;
        }
        await tx.gitHubSyncRun.update({
          where: { id },
          data: {
            status: 'RUNNING',
            step: 'REPOSITORY',
            startedAt: now,
            heartbeatAt: now
          }
        });
        return true;
      },
      { inactiveResult: false, busyResult: false }
    );
  },

  updateProgress(id, data, now = new Date()) {
    return updateOwnedRun(id, { ...data, heartbeatAt: now }, { now });
  },

  async succeed(id, summary, finishedAt, durationMs) {
    const changed = await updateOwnedRun(
      id,
      {
        status: 'SUCCEEDED',
        step: 'COMPLETED',
        activeProjectId: null,
        currentBranch: null,
        heartbeatAt: finishedAt,
        finishedAt,
        durationMs,
        branchCount: summary.branches?.found ?? 0,
        processedBranches: summary.branches?.active ?? 0,
        commitsFound: summary.commits?.found ?? 0,
        commitsObserved: summary.commits?.foundAcrossBranches ?? 0,
        commitsCreated: summary.commits?.created ?? 0,
        commitLinksCreated: summary.commits?.linksCreated ?? 0,
        pullRequestsFound: summary.pullRequests?.found ?? 0,
        pullRequestsCreated: summary.pullRequests?.created ?? 0,
        pullRequestsUpdated: summary.pullRequests?.updated ?? 0,
        issuesFound: summary.issues?.found ?? 0,
        issuesCreated: summary.issues?.created ?? 0,
        issuesUpdated: summary.issues?.updated ?? 0,
        errorCode: null,
        errorMessage: null
      },
      { now: finishedAt, terminal: true }
    );
    return changed ? this.findById(id) : null;
  },

  async fail(id, { errorCode, errorMessage, finishedAt, durationMs, retryAt, permanent }) {
    const changed = await updateOwnedRun(
      id,
      {
        status: 'FAILED',
        activeProjectId: null,
        heartbeatAt: finishedAt,
        finishedAt,
        durationMs,
        errorCode,
        errorMessage
      },
      { now: finishedAt, terminal: true, retryAt, permanent }
    );
    return changed ? this.findById(id) : null;
  },

  async failOnRecoveryConnection(id, failure) {
    const client = recoveryPrisma();
    const found = await client.gitHubSyncRun.findUnique({
      where: { id },
      select: { projectId: true }
    });
    if (!found) return null;
    const changed = await recoveryTransaction(async (tx) => {
      try {
        await lockActiveProject(tx, found.projectId, { nowait: true });
      } catch (error) {
        if (error instanceof ProjectServiceError && error.statusCode === 404) return false;
        throw error;
      }
      await assertProjectWriteGuard(tx, found.projectId);
      const run = await lockedRun(tx, id);
      if (!ownsLease(run, failure.finishedAt)) return false;
      await reschedule(tx, run, failure.finishedAt, {
        failed: true,
        retryAt: failure.retryAt,
        permanent: failure.permanent
      });
      await tx.gitHubSyncRun.update({ where: { id }, data: failedRun(failure) });
      return true;
    });
    return changed ? client.gitHubSyncRun.findUnique({ where: { id } }) : null;
  },

  async expireIfStillStale(id, projectId, cutoff, now = new Date()) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Same lock order as artifact transactions. No old writer can cross this commit.
        await tx.$queryRaw`SELECT id FROM Project WHERE id = ${projectId} FOR UPDATE NOWAIT`;
        const run = await lockedRun(tx, id);
        if (
          !run ||
          run.activeProjectId !== projectId ||
          !activeStatuses.includes(run.status) ||
          (run.heartbeatAt || run.updatedAt) >= cutoff
        )
          return { count: 0 };
        const message = 'A execução foi interrompida antes da conclusão.';
        await tx.gitHubSyncRun.update({
          where: { id },
          data: {
            status: 'FAILED',
            activeProjectId: null,
            automaticSlot: null,
            automaticInstallationId: null,
            heartbeatAt: now,
            finishedAt: now,
            errorCode: 'GITHUB_SYNC_STALE',
            errorMessage: message
          }
        });
        await tx.projectGitHubIntegration.updateMany({
          where: { projectId },
          data: {
            lastSyncStatus: 'FALHA',
            lastSyncError: message
          }
        });
        await reschedule(tx, run, now, { failed: true });
        return { count: 1 };
      });
    } catch (error) {
      if (isProjectWriteBusy(error)) return { count: 0 };
      throw error;
    }
  },

  listRecoverable(cutoff, limit = 100) {
    return prisma.gitHubSyncRun.findMany({
      where: {
        activeProjectId: { not: null },
        status: { in: activeStatuses },
        OR: [
          { status: 'QUEUED' },
          { heartbeatAt: { lt: cutoff } },
          { heartbeatAt: null, updatedAt: { lt: cutoff } }
        ]
      },
      orderBy: { createdAt: 'asc' },
      take: limit
    });
  },

  listAutomaticCandidates(now, limit = 100, after = null) {
    return prisma.projectGitHubIntegration.findMany({
      where: {
        autoSyncEnabled: true,
        status: 'ACTIVE',
        installation: { status: 'ACTIVE' },
        project: {
          deletedAt: null,
          purgeStartedAt: null,
          githubSyncRuns: { none: { activeProjectId: { not: null } } }
        },
        OR: [{ nextSyncAt: null }, { nextSyncAt: { lte: now } }],
        // Value-based keyset: reserving/rescheduling/deleting the cursor row must
        // not move the next page. MySQL sorts NULL schedules before dated ones.
        ...(after && {
          AND: {
            OR:
              after.nextSyncAt === null
                ? [
                    { nextSyncAt: null, projectId: { gt: after.projectId } },
                    { nextSyncAt: { not: null } }
                  ]
                : [
                    { nextSyncAt: { gt: after.nextSyncAt } },
                    { nextSyncAt: after.nextSyncAt, projectId: { gt: after.projectId } }
                  ]
          }
        })
      },
      select: { projectId: true, nextSyncAt: true },
      orderBy: [{ nextSyncAt: 'asc' }, { projectId: 'asc' }],
      take: limit
    });
  },

  async reserveAutomatic(
    projectId,
    now = new Date(),
    policy = syncSchedulePolicy(),
    recoveryBefore = null
  ) {
    try {
      return await withSyncWrite(
        projectId,
        async (tx) => {
          const integration = await tx.projectGitHubIntegration.findUnique({
            where: { projectId },
            include: { installation: true, project: true }
          });
          if (!eligibleIntegration(integration)) return { outcome: 'INELIGIBLE' };
          const active = await tx.gitHubSyncRun.findUnique({
            where: { activeProjectId: projectId }
          });
          if (active) return { outcome: 'ALREADY_RUNNING', run: active };
          if (integration.nextSyncAt > now) return { outcome: 'NOT_DUE' };
          const cooldown = integration.installation.syncNotBefore;
          if (
            !integration.nextSyncAt ||
            (recoveryBefore && integration.nextSyncAt < recoveryBefore) ||
            cooldown > now
          ) {
            const nextSyncAt = distributedSyncAt(
              projectId,
              cooldown > now ? cooldown : now,
              policy
            );
            await tx.projectGitHubIntegration.update({
              where: { projectId },
              data: { nextSyncAt }
            });
            return {
              outcome: 'SCHEDULED',
              reason:
                cooldown > now
                  ? 'INSTALLATION_COOLDOWN'
                  : integration.nextSyncAt
                    ? 'OVERDUE_RESTART_JITTER'
                    : 'INITIAL_SCHEDULE',
              previousNextSyncAt: integration.nextSyncAt,
              nextSyncAt
            };
          }
          const occupied = await tx.gitHubSyncRun.findMany({
            where: { automaticSlot: { not: null } },
            select: { automaticSlot: true, automaticInstallationId: true }
          });
          if (occupied.some((run) => run.automaticInstallationId === integration.installationId))
            return { outcome: 'CAPACITY', reason: 'INSTALLATION_BUSY' };
          if (occupied.length >= policy.concurrency)
            return { outcome: 'CAPACITY', reason: 'GLOBAL_CAPACITY' };
          const slots = new Set(occupied.map((run) => run.automaticSlot));
          let slot = 1;
          while (slot <= policy.concurrency && slots.has(slot)) slot++;
          if (slot > policy.concurrency) return { outcome: 'CAPACITY', reason: 'GLOBAL_CAPACITY' };
          const run = await tx.gitHubSyncRun.create({
            data: {
              projectId,
              activeProjectId: projectId,
              origin: 'AUTOMATIC',
              automaticSlot: slot,
              automaticInstallationId: integration.installationId
            }
          });
          await tx.projectGitHubIntegration.update({
            where: { projectId },
            data: { nextSyncAt: null }
          });
          return { outcome: 'RESERVED', run };
        },
        { inactiveResult: { outcome: 'INELIGIBLE' }, busyResult: { outcome: 'CONTENDED' } }
      );
    } catch (error) {
      // Unique slots arbitrate workers across different projects/installations.
      // A losing transaction leaves no run or schedule mutation behind.
      if (['P2002', 'P2034'].includes(error.code)) return { outcome: 'CONTENDED' };
      throw error;
    }
  },

  isActiveConflict(error) {
    return error?.code === 'P2002';
  }
};
