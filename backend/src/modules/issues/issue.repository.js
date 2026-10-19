// Repository de Issues importadas do GitHub.
import { prisma } from '../../database/prismaClient.js';
import { logger } from '../../shared/logger/index.js';
import { SYNC_WRITE, withActiveProjectWrite } from '../projects/active-project-write.js';
import { changedFields, lastByKey, selectFields } from '../../shared/persistence/changed-fields.js';
import {
  artifactsByNumber,
  insertInChunks,
  unseenProviderEvents
} from '../../shared/persistence/provider-events.js';

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

  async upsertMany(data) {
    if (data.length === 0) return { created: 0, updated: 0 };

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
        return { created: created.length, updated };
      },
      SYNC_WRITE
    );
  },

  async insertLifecycleEvents(tx, projectId, events) {
    const byNumber = await artifactsByNumber(
      tx.issue,
      projectId,
      events.map(({ number }) => number),
      { id: true, title: true, githubUrl: true }
    );
    const associated = events.filter(({ number }) => byNumber.has(number));
    const ignoredCount = events.length - associated.length;
    if (ignoredCount)
      logger.warn('Eventos de issue sem associação foram ignorados.', {
        event: 'github_issue_lifecycle_orphan',
        projectId,
        ignoredCount
      });
    const fresh = await unseenProviderEvents(tx.issueLifecycleEvent, projectId, associated);
    const count = await insertInChunks(
      tx.issueLifecycleEvent,
      fresh.map(({ number, ...event }) => ({
        ...event,
        projectId,
        issueId: byNumber.get(number).id
      }))
    );
    return {
      count,
      ignoredCount,
      inserted: fresh.map(({ number, ...event }) => ({ ...event, artifact: byNumber.get(number) }))
    };
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
