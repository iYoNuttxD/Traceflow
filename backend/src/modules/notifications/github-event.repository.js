import {
  issueTransition,
  occurrenceKey,
  pullRequestStateAnomaly,
  pullRequestTransition,
  safeGithubUrl,
  snapshotArtifactTitle
} from './github-event.policy.js';

const ISSUE = 'ISSUE';
const PULL_REQUEST = 'PULL_REQUEST';
const transitionOf = new Map([
  [ISSUE, issueTransition],
  [PULL_REQUEST, pullRequestTransition]
]);

function groupTaskIds(pairs) {
  const grouped = new Map();
  for (const [artifactId, taskId] of pairs) {
    if (!grouped.has(artifactId)) grouped.set(artifactId, new Set());
    grouped.get(artifactId).add(taskId);
  }
  return new Map(
    [...grouped].map(([artifactId, taskIds]) => [
      artifactId,
      [...taskIds].sort((left, right) => left - right)
    ])
  );
}

async function linkedTaskIds(tx, projectId, kind, artifactIds) {
  if (kind === ISSUE) {
    const rows = await tx.taskIssue.findMany({
      where: { issueId: { in: artifactIds }, task: { projectId } },
      select: { issueId: true, taskId: true }
    });
    return groupTaskIds(rows.map((row) => [row.issueId, row.taskId]));
  }
  const rows = await tx.task.findMany({
    where: { projectId, pullRequestId: { in: artifactIds } },
    select: { id: true, pullRequestId: true }
  });
  return groupTaskIds(rows.map((row) => [row.pullRequestId, row.id]));
}

function transitionsOf(kind, previous, incoming) {
  const detect = transitionOf.get(kind);
  const latest = new Map(incoming.map((item) => [item.githubId, item]));
  const candidates = [];
  let anomalies = 0;
  for (const [githubId, item] of latest) {
    const before = previous.get(githubId);
    if (!before) continue;
    if (kind === PULL_REQUEST && pullRequestStateAnomaly(before, item)) anomalies += 1;
    const transition = detect(before, item);
    if (transition) candidates.push({ artifactId: before.id, item, ...transition });
  }
  return { candidates, anomalies };
}

export const githubEventRepository = {
  async recordTransitions(tx, { projectId, kind, previous, incoming, detectedAt }) {
    const { candidates, anomalies } = transitionsOf(kind, previous, incoming);
    const empty = { transitions: 0, linkedTasks: 0, anomalies };
    if (!candidates.length) return empty;

    const tasksByArtifact = await linkedTaskIds(
      tx,
      projectId,
      kind,
      candidates.map((candidate) => candidate.artifactId)
    );
    const linked = candidates
      .filter((candidate) => tasksByArtifact.has(candidate.artifactId))
      .map((candidate) => ({ ...candidate, key: occurrenceKey({ ...candidate, detectedAt }) }));
    if (!linked.length) return empty;

    const recorded = await tx.gitHubArtifactEvent.findMany({
      where: { projectId, occurrenceKey: { in: linked.map((candidate) => candidate.key) } },
      select: { occurrenceKey: true }
    });
    const known = new Set(recorded.map((row) => row.occurrenceKey));
    let transitions = 0;
    let linkedTasks = 0;
    for (const candidate of linked) {
      if (known.has(candidate.key)) continue;
      const taskIds = tasksByArtifact.get(candidate.artifactId);
      await tx.gitHubArtifactEvent.create({
        data: {
          projectId,
          type: candidate.type,
          issueId: kind === ISSUE ? candidate.artifactId : null,
          pullRequestId: kind === PULL_REQUEST ? candidate.artifactId : null,
          artifactNumber: candidate.item.number,
          artifactTitle: snapshotArtifactTitle(candidate.item.title),
          artifactUrl: safeGithubUrl(candidate.item.githubUrl),
          occurredAt: candidate.occurredAt,
          detectedAt,
          nextAttemptAt: detectedAt,
          linkedTaskCount: taskIds.length,
          occurrenceKey: candidate.key,
          targets: { create: taskIds.map((taskId) => ({ taskId })) }
        },
        select: { id: true }
      });
      known.add(candidate.key);
      transitions += 1;
      linkedTasks += taskIds.length;
    }
    return { transitions, linkedTasks, anomalies };
  }
};
