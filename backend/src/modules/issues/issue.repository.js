// Repository de Issues importadas do GitHub.
import { prisma } from '../../database/prismaClient.js';
import { SYNC_WRITE, withActiveProjectWrite } from '../projects/active-project-write.js';
import { githubEventRepository } from '../notifications/github-event.repository.js';
import { changedFields, lastByKey, selectFields } from '../../shared/persistence/changed-fields.js';

const ISSUE_FIELDS = [
  'number',
  'title',
  'description',
  'state',
  'authorUsername',
  'assigneeUsername',
  'labels',
  'milestone',
  'githubUrl',
  'createdAtGithub',
  'updatedAtGithub',
  'closedAtGithub'
];

export const issueRepository = {
  async findGithubIdsByProjectId(projectId, githubIds) {
    const issues = await prisma.issue.findMany({
      where: {
        projectId,
        ...(Array.isArray(githubIds) ? { githubId: { in: githubIds } } : {})
      },
      select: { githubId: true }
    });

    return issues.map((issue) => issue.githubId);
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
        const existing = await tx.issue.findMany({
          where: { projectId, githubId: { in: page.map(({ githubId }) => githubId) } },
          select: { id: true, githubId: true, ...selectFields(ISSUE_FIELDS) }
        });
        const previous = new Map(existing.map((row) => [row.githubId, row]));
        const created = page.filter(({ githubId }) => !previous.has(githubId));
        if (created.length) await tx.issue.createMany({ data: created });
        let updated = 0;
        for (const issue of page) {
          const row = previous.get(issue.githubId);
          if (!row) continue;
          const changes = changedFields(row, issue, ISSUE_FIELDS);
          if (Object.keys(changes).length === 0) continue;
          updated += 1;
          await tx.issue.updateMany({ where: { id: row.id }, data: changes });
        }
        const recorded = await githubEventRepository.recordTransitions(tx, {
          projectId,
          kind: 'ISSUE',
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
    const search = typeof filters.search === 'string' ? filters.search.trim() : '';
    const numericSearch = search.replace(/\D/g, '');
    const issueNumber = numericSearch ? Number(numericSearch) : null;

    return prisma.issue.findMany({
      where: {
        projectId,
        ...(search
          ? {
              OR: [
                { title: { contains: search } },
                { authorUsername: { contains: search } },
                ...(Number.isInteger(issueNumber) && issueNumber > 0
                  ? [{ number: issueNumber }]
                  : [])
              ]
            }
          : {})
      },
      orderBy: [{ updatedAtGithub: 'desc' }, { createdAtGithub: 'desc' }, { createdAt: 'desc' }]
    });
  }
};
