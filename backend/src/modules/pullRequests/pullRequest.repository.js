import { logger } from '../../shared/logger/index.js';
// Repository de Pull Requests importados do GitHub.
import { prisma } from '../../database/prismaClient.js';
import { SYNC_WRITE, withActiveProjectWrite } from '../projects/active-project-write.js';
import { githubEventRepository } from '../notifications/github-event.repository.js';
import { changedFields, lastByKey, selectFields } from '../../shared/persistence/changed-fields.js';

const PULL_REQUEST_FIELDS = [
  'number',
  'title',
  'description',
  'state',
  'authorUsername',
  'sourceBranch',
  'targetBranch',
  'githubUrl',
  'createdAtGithub',
  'updatedAtGithub',
  'closedAtGithub',
  'mergedAtGithub'
];

export const pullRequestRepository = {
  async findByProjectIdAndGithubId(projectId, githubId) {
    return prisma.pullRequest.findUnique({
      where: {
        projectId_githubId: {
          projectId,
          githubId
        }
      }
    });
  },

  async findGithubIdsByProjectId(projectId, githubIds) {
    const pullRequests = await prisma.pullRequest.findMany({
      where: {
        projectId,
        ...(Array.isArray(githubIds) ? { githubId: { in: githubIds } } : {})
      },
      select: { githubId: true }
    });

    return pullRequests.map((pullRequest) => pullRequest.githubId);
  },

  async upsertMany(data, { detectedAt } = {}) {
    if (data.length === 0) {
      return { created: 0, updated: 0, transitions: 0, linkedTasks: 0, anomalies: 0 };
    }

    const page = lastByKey(data, 'githubId');
    const projectId = page[0].projectId;
    return withActiveProjectWrite(
      projectId,
      async (tx) => {
        const existing = await tx.pullRequest.findMany({
          where: { projectId, githubId: { in: page.map(({ githubId }) => githubId) } },
          select: { id: true, githubId: true, ...selectFields(PULL_REQUEST_FIELDS) }
        });
        const previous = new Map(existing.map((row) => [row.githubId, row]));
        const created = page.filter(({ githubId }) => !previous.has(githubId));
        if (created.length) await tx.pullRequest.createMany({ data: created });
        let updated = 0;
        for (const pullRequest of page) {
          const row = previous.get(pullRequest.githubId);
          if (!row) continue;
          const changes = changedFields(row, pullRequest, PULL_REQUEST_FIELDS);
          if (Object.keys(changes).length === 0) continue;
          updated += 1;
          await tx.pullRequest.updateMany({ where: { id: row.id }, data: changes });
        }
        const recorded = await githubEventRepository.recordTransitions(tx, {
          projectId,
          kind: 'PULL_REQUEST',
          previous,
          incoming: page,
          detectedAt: detectedAt ?? new Date()
        });
        return { created: created.length, updated, ...recorded };
      },
      SYNC_WRITE
    );
  },

  async appendLifecycleEvents(projectId, events, completedAt = new Date()) {
    return withActiveProjectWrite(
      projectId,
      async (tx) => {
        const numbers = [...new Set(events.map(({ number }) => number))];
        const byNumber = new Map();
        for (let offset = 0; offset < numbers.length; offset += 500) {
          const pullRequests = await tx.pullRequest.findMany({
            where: { projectId, number: { in: numbers.slice(offset, offset + 500) } },
            select: { id: true, number: true }
          });
          pullRequests.forEach((pullRequest) => byNumber.set(pullRequest.number, pullRequest.id));
        }
        const associated = events.filter(({ number }) => byNumber.has(number));
        const ignoredCount = events.length - associated.length;
        if (ignoredCount)
          logger.warn('Eventos de PR sem associação foram ignorados.', {
            event: 'github_pr_lifecycle_orphan',
            projectId,
            ignoredCount
          });
        let count = 0;
        for (let offset = 0; offset < associated.length; offset += 500) {
          const batch = associated.slice(offset, offset + 500);
          const result = await tx.pullRequestLifecycleEvent.createMany({
            data: batch.map(({ number, ...event }) => ({
              ...event,
              projectId,
              pullRequestId: byNumber.get(number)
            })),
            skipDuplicates: true
          });
          count += result.count;
        }
        // A skipped event cannot establish complete lifecycle coverage.
        if (!ignoredCount) {
          await tx.projectGitHubIntegration.updateMany({
            where: { projectId },
            data: { pullRequestLifecycleSyncedAt: completedAt }
          });
          await tx.projectGitHubIntegration.updateMany({
            where: { projectId, pullRequestLifecycleCoverageFrom: null },
            data: { pullRequestLifecycleCoverageFrom: completedAt }
          });
        }
        return { count, ignoredCount };
      },
      { timeout: 120000 }
    );
  },

  async listByProjectId(projectId, filters = {}) {
    const numericSearch = String(filters.search || '').replace(/\D/g, '');
    const pullRequestNumber = Number(numericSearch);

    return prisma.pullRequest.findMany({
      where: {
        projectId,
        AND: [
          ...(filters.branch
            ? [{ OR: [{ sourceBranch: filters.branch }, { targetBranch: filters.branch }] }]
            : []),
          ...(filters.search
            ? [
                {
                  OR: [
                    { title: { contains: filters.search } },
                    { authorUsername: { contains: filters.search } },
                    ...(numericSearch && Number.isInteger(pullRequestNumber)
                      ? [{ number: pullRequestNumber }]
                      : [])
                  ]
                }
              ]
            : [])
        ]
      },
      orderBy: [{ updatedAtGithub: 'desc' }, { createdAtGithub: 'desc' }, { createdAt: 'desc' }]
    });
  }
};
