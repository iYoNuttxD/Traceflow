export const LINKED_SINCE = new Date('2026-01-01T00:00:00.000Z');

let providerSequence = 700000;

export function nextProviderEventId() {
  providerSequence += 1;
  return String(providerSequence);
}

export function coverGithubEvents(prisma, projectId, coverageFrom = LINKED_SINCE) {
  return prisma.gitHubEventCoverage.upsert({
    where: { projectId },
    create: { projectId, coverageFrom },
    update: { coverageFrom }
  });
}

export function openLinkPeriod(
  prisma,
  { projectId, taskId, issueId = null, pullRequestId = null, linkedAt = LINKED_SINCE }
) {
  return prisma.taskArtifactLinkPeriod.create({
    data: { projectId, taskId, issueId, pullRequestId, linkedAt }
  });
}

export async function backdateGithubLinks(prisma, projectId, at = LINKED_SINCE) {
  await prisma.taskArtifactLinkPeriod.updateMany({
    where: { projectId, unlinkedAt: null },
    data: { linkedAt: at }
  });
  await coverGithubEvents(prisma, projectId, at);
}

export async function recordGithubEvent(
  repository,
  prisma,
  { projectId, kind, number, eventType, occurredAt, detectedAt = new Date(), providerEventId }
) {
  await prisma.gitHubEventCoverage.upsert({
    where: { projectId },
    create: { projectId, coverageFrom: LINKED_SINCE },
    update: {}
  });
  const event = {
    providerEventId:
      providerEventId ?? `${projectId}:${kind}:${number}:${eventType}:${occurredAt.toISOString()}`,
    number,
    eventType,
    occurredAt
  };
  return repository.record(
    projectId,
    {
      pullRequestEvents: kind === 'PULL_REQUEST' ? [event] : [],
      issueEvents: kind === 'ISSUE' ? [event] : [],
      readStartedAt: detectedAt
    },
    detectedAt
  );
}

const instantOf = (value) => (value ? new Date(value) : null);

function lifecycleEvent(kind, number, eventType, occurredAt) {
  return {
    kind,
    providerEventId: `${kind}:${number}:${eventType}:${occurredAt.toISOString()}`,
    number,
    eventType,
    occurredAt
  };
}

export function lifecycleEventsFor({ issues = [], pullRequests = [] }) {
  const events = [];
  for (const issue of issues) {
    const closedAt = instantOf(issue.closedAtGithub ?? issue.closed_at);
    const reopenedAt = instantOf(issue.reopenedAt ?? issue.reopened_at);
    if (issue.state === 'closed' && closedAt)
      events.push(lifecycleEvent('ISSUE', issue.number, 'CLOSED', closedAt));
    if (issue.state === 'open' && reopenedAt)
      events.push(lifecycleEvent('ISSUE', issue.number, 'REOPENED', reopenedAt));
  }
  for (const pullRequest of pullRequests) {
    const mergedAt = instantOf(pullRequest.mergedAtGithub ?? pullRequest.merged_at);
    const closedAt = instantOf(pullRequest.closedAtGithub ?? pullRequest.closed_at);
    if (mergedAt)
      events.push(lifecycleEvent('PULL_REQUEST', pullRequest.number, 'MERGED', mergedAt));
    else if (pullRequest.state === 'closed' && closedAt)
      events.push(lifecycleEvent('PULL_REQUEST', pullRequest.number, 'CLOSED', closedAt));
  }
  return events;
}
