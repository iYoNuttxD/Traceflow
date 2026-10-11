export function lockProject(tx, projectId) {
  return tx.$queryRaw`SELECT id FROM Project WHERE id = ${projectId} FOR UPDATE`;
}

export function lockUserNoWait(tx, userId) {
  return tx.$queryRaw`SELECT id FROM User WHERE id = ${userId} FOR UPDATE NOWAIT`;
}

export function isLockBusy(error) {
  return error?.code === 'P2010' && String(error.meta?.code) === '3572';
}

export function lockMilestone(tx, milestoneId) {
  return tx.$queryRaw`SELECT id FROM Milestone WHERE id = ${milestoneId} FOR UPDATE`;
}
