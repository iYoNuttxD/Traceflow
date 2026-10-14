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
