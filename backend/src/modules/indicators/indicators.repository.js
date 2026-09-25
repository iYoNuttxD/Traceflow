import { prisma } from '../../database/prismaClient.js';

const projectSelect = {
  id: true,
  githubIntegration: {
    select: { status: true, lastSyncAt: true, lastSyncStatus: true }
  }
};

export const indicatorsRepository = {
  readProgress(projectId) {
    return prisma.$transaction(
      async (tx) => {
        const project = await tx.project.findFirst({
          where: { id: projectId, deletedAt: null },
          select: { id: true }
        });
        if (!project) return null;
        const counts = await tx.task.groupBy({
          by: ['status'],
          where: { projectId },
          _count: { _all: true }
        });
        return { counts, asOf: new Date() };
      },
      { isolationLevel: 'RepeatableRead' }
    );
  },

  readActivity(projectId, period) {
    return prisma.$transaction(
      async (tx) => {
        const project = await tx.project.findFirst({
          where: { id: projectId, deletedAt: null },
          select: projectSelect
        });
        if (!project) return null;
        const branch = await tx.gitBranch.findFirst({
          where: { projectId, name: 'main', isActive: true },
          select: {
            id: true,
            name: true,
            headSha: true,
            lastSyncedHeadSha: true,
            lastSyncedGeneration: true,
            lastSeenAt: true
          }
        });
        const validBranch = branch?.name === 'main' ? branch : null;
        const commitRows =
          validBranch?.lastSyncedHeadSha && validBranch.lastSyncedGeneration
            ? await tx.$queryRaw`
          SELECT u.id AS userId, u.name AS displayName,
                 COUNT(DISTINCT c.id) AS count
          FROM Commit c
          JOIN CommitBranch cb ON cb.commitId = c.id
          LEFT JOIN GitHubIdentity gi ON gi.githubUserId = c.authorGithubUserId
          LEFT JOIN ProjectMembership pm ON pm.projectId = ${projectId}
            AND pm.userId = gi.userId AND pm.isActive = TRUE
          LEFT JOIN User u ON u.id = pm.userId AND u.isActive = TRUE
            AND u.accountStatus = 'ACTIVE' AND u.anonymizedAt IS NULL
          WHERE cb.branchId = ${validBranch.id}
            AND cb.lastObservedGeneration = ${validBranch.lastSyncedGeneration}
            AND c.projectId = ${projectId}
            AND c.date >= ${period.startInclusive}
            AND c.date < ${period.endExclusive}
          GROUP BY u.id, u.name
        `
            : null;
        const taskRows = await tx.$queryRaw`
        SELECT u.id AS userId, u.name AS displayName,
               (m.responsibleUserIdSnapshot IS NULL) AS unknownHistorical,
               COUNT(*) AS count
        FROM TaskMovement m
        JOIN Task t ON t.id = m.taskId AND t.projectId = ${projectId}
        LEFT JOIN ProjectMembership pm ON pm.projectId = ${projectId}
          AND pm.userId = m.responsibleUserIdSnapshot AND pm.isActive = TRUE
        LEFT JOIN User u ON u.id = pm.userId AND u.isActive = TRUE
          AND u.accountStatus = 'ACTIVE' AND u.anonymizedAt IS NULL
        WHERE m.projectId = ${projectId}
          AND m.toStatus = 'CONCLUIDO'
          AND m.movedAt >= ${period.startInclusive}
          AND m.movedAt < ${period.endExclusive}
          AND NOT EXISTS (
            SELECT 1 FROM TaskMovement later
            WHERE later.projectId = ${projectId} AND later.taskId = m.taskId
              AND later.movedAt < ${period.endExclusive}
              AND (later.movedAt > m.movedAt
                OR (later.movedAt = m.movedAt AND later.id > m.id))
          )
        GROUP BY u.id, u.name, (m.responsibleUserIdSnapshot IS NULL)
      `;
        return { project, branch: validBranch, commitRows, taskRows, asOf: new Date() };
      },
      { isolationLevel: 'RepeatableRead' }
    );
  }
};
