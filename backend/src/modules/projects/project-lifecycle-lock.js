import { lockProject } from '../../database/locks.js';

// Every lifecycle or membership-role transition acquires locks in this order.
// A current read is required on MySQL: a normal SELECT can retain an older RR snapshot.
export async function lockProjectLifecycle(tx, projectId) {
  const rows = await lockProject(tx, projectId);
  return rows.length > 0;
}

export async function lockProjectMembership(tx, projectId, userId) {
  const rows = await tx.$queryRaw`
    SELECT id FROM ProjectMembership
    WHERE projectId = ${projectId} AND userId = ${userId}
    FOR UPDATE
  `;
  return rows.length > 0;
}
