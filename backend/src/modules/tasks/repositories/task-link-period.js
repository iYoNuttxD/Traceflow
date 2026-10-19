export function openLinkPeriod(tx, { projectId, taskId, issueId, pullRequestId, linkedAt }) {
  return tx.taskArtifactLinkPeriod.create({
    data: {
      projectId,
      taskId,
      issueId: issueId ?? null,
      pullRequestId: pullRequestId ?? null,
      ...(linkedAt ? { linkedAt } : {})
    }
  });
}

export function closeLinkPeriods(tx, where, unlinkedAt = new Date()) {
  return tx.taskArtifactLinkPeriod.updateMany({
    where: { ...where, unlinkedAt: null },
    data: { unlinkedAt }
  });
}
