import { logger } from '../../shared/logger/index.js';
// Repository de Pull Requests importados do GitHub.
import { prisma } from '../../database/prismaClient.js';
import { SYNC_WRITE, withActiveProjectWrite } from '../projects/active-project-write.js';
import { pullRequestStateAnomaly } from '../notifications/github-event.policy.js';
import { changedFields, lastByKey, selectFields } from '../../shared/persistence/changed-fields.js';
import {
  artifactsByNumber,
  insertInChunks,
  unseenProviderEvents
} from '../../shared/persistence/provider-events.js';

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

  async upsertMany(data) {
    if (data.length === 0) return { created: 0, updated: 0, anomalies: 0 };

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
        const anomalies = page.filter((pullRequest) =>
          pullRequestStateAnomaly(previous.get(pullRequest.githubId), pullRequest)
        ).length;
        return { created: created.length, updated, anomalies };
      },
      SYNC_WRITE
    );
  },

  async insertLifecycleEvents(tx, projectId, events, completedAt = new Date()) {
    const byNumber = await artifactsByNumber(
      tx.pullRequest,
      projectId,
      events.map(({ number }) => number),
      { id: true, title: true, githubUrl: true, mergedAtGithub: true }
    );
    const associated = events.filter(({ number }) => byNumber.has(number));
    const ignoredCount = events.length - associated.length;
    if (ignoredCount)
      logger.warn('Eventos de PR sem associação foram ignorados.', {
        event: 'github_pr_lifecycle_orphan',
        projectId,
        ignoredCount
      });
    const fresh = await unseenProviderEvents(tx.pullRequestLifecycleEvent, projectId, associated);
    const count = await insertInChunks(
      tx.pullRequestLifecycleEvent,
      fresh.map(({ number, ...event }) => ({
        ...event,
        projectId,
        pullRequestId: byNumber.get(number).id
      }))
    );
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
    return {
      count,
      ignoredCount,
      inserted: fresh.map(({ number, ...event }) => ({ ...event, artifact: byNumber.get(number) }))
    };
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
