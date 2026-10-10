export function lockProject(tx, projectId) {
  return tx.$queryRaw`SELECT id FROM Project WHERE id = ${projectId} FOR UPDATE`;
}

export function lockUser(tx, userId) {
  return tx.$queryRaw`SELECT id FROM User WHERE id = ${userId} FOR UPDATE`;
}

export function lockMilestone(tx, milestoneId) {
  return tx.$queryRaw`SELECT id FROM Milestone WHERE id = ${milestoneId} FOR UPDATE`;
}
