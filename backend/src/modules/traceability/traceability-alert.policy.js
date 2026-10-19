export const TRACEABILITY_ALERT_TYPES = Object.freeze([
  'TASK_CONCLUDED_WITHOUT_COMMIT',
  'PULL_REQUEST_MERGED_WITHOUT_TASK',
  'ISSUE_CLOSED_WITHOUT_TASK'
]);

export const TRACEABILITY_ALERT_STATUSES = Object.freeze(['OPEN', 'DISMISSED', 'RESOLVED']);

export const ACTIVE_ALERT_STATUSES = Object.freeze(['OPEN', 'DISMISSED']);

export const TASK_ALERT = 'TASK_CONCLUDED_WITHOUT_COMMIT';
export const PULL_REQUEST_ALERT = 'PULL_REQUEST_MERGED_WITHOUT_TASK';
export const ISSUE_ALERT = 'ISSUE_CLOSED_WITHOUT_TASK';

export const COMPLETION_TIME_UNAVAILABLE = 'COMPLETION_TIME_UNAVAILABLE';
export const CLOSE_TIME_UNAVAILABLE = 'CLOSE_TIME_UNAVAILABLE';

export const SUBJECT_TITLE_MAX_LENGTH = 256;

export const RECONCILIATION_ATTEMPT_GRACE_MS = 15 * 60_000;
export const RECONCILIATION_SWEEP_AGE_MS = 24 * 3_600_000;
export const RECONCILIATION_STALE_AGE_MS = 25 * 3_600_000;
export const PENDING_FIRST = 'PENDING_FIRST';
export const STALE = 'STALE';
export const CURRENT = 'CURRENT';

const timeOf = (value) => (value ? value.getTime() : null);

function unresolvedAttemptAt({ lastAttemptAt, lastSucceededAt, lastFailedAt }) {
  const attempt = timeOf(lastAttemptAt);
  const outcome = Math.max(timeOf(lastSucceededAt) ?? -Infinity, timeOf(lastFailedAt) ?? -Infinity);
  return attempt !== null && attempt > outcome ? attempt : null;
}

export function reconciliationState(reconciliation, now) {
  if (!reconciliation?.lastSucceededAt) return PENDING_FIRST;
  const succeeded = reconciliation.lastSucceededAt.getTime();
  const failed = timeOf(reconciliation.lastFailedAt);
  const attempt = unresolvedAttemptAt(reconciliation);
  if (failed !== null && failed > succeeded) return STALE;
  if (attempt !== null && now.getTime() - attempt > RECONCILIATION_ATTEMPT_GRACE_MS) return STALE;
  if (now.getTime() - succeeded > RECONCILIATION_STALE_AGE_MS) return STALE;
  return CURRENT;
}

const oldestFirst = (left, right) =>
  (left.at ?? -Infinity) - (right.at ?? -Infinity) || left.projectId - right.projectId;

export function reconciliationQueue(projects, now) {
  const groups = [[], [], [], []];
  for (const { projectId, reconciliation } of projects) {
    if (!reconciliation) {
      groups[2].push({ projectId, at: null });
      continue;
    }
    const attempt = unresolvedAttemptAt(reconciliation);
    const succeeded = timeOf(reconciliation.lastSucceededAt);
    const failed = timeOf(reconciliation.lastFailedAt);
    if (attempt !== null && now.getTime() - attempt <= RECONCILIATION_ATTEMPT_GRACE_MS) continue;
    if (failed !== null && (succeeded === null || failed > succeeded))
      groups[0].push({ projectId, at: failed });
    else if (attempt !== null) groups[1].push({ projectId, at: attempt });
    else if (succeeded === null) groups[2].push({ projectId, at: null });
    else if (now.getTime() - succeeded > RECONCILIATION_SWEEP_AGE_MS)
      groups[3].push({ projectId, at: succeeded });
  }
  return groups.flatMap((group) => group.sort(oldestFirst).map((entry) => entry.projectId));
}

export const ALERT_SUBJECTS = Object.freeze({
  [TASK_ALERT]: Object.freeze({ subjectType: 'TASK', foreignKey: 'taskId' }),
  [PULL_REQUEST_ALERT]: Object.freeze({ subjectType: 'PULL_REQUEST', foreignKey: 'pullRequestId' }),
  [ISSUE_ALERT]: Object.freeze({ subjectType: 'ISSUE', foreignKey: 'issueId' })
});

const active = Object.freeze({ active: true, resolutionReason: null });
const inactive = (resolutionReason) => ({ active: false, resolutionReason });

function instant(value) {
  if (value === null || value === undefined) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

export function alertDedupeKey(type, subjectId) {
  return `${type}:${subjectId}`;
}

export function subjectIdFromDedupeKey(dedupeKey) {
  const id = Number(String(dedupeKey).split(':').at(-1));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function evaluateTaskAlert({ task, commitCount = 0 }) {
  if (!task) return inactive('TASK_DELETED');
  if (commitCount > 0) return inactive('COMMIT_LINKED');
  if (task.status !== 'CONCLUIDO') return inactive('TASK_REOPENED');
  return active;
}

export function evaluatePullRequestAlert({ pullRequest, linkedTaskCount = 0 }) {
  if (!pullRequest) return inactive('RULE_NO_LONGER_APPLIES');
  if (linkedTaskCount > 0) return inactive('PULL_REQUEST_LINKED');
  if (instant(pullRequest.mergedAtGithub) === null) return inactive('RULE_NO_LONGER_APPLIES');
  return active;
}

export function evaluateIssueAlert({ issue, linkedTaskCount = 0 }) {
  if (!issue) return inactive('RULE_NO_LONGER_APPLIES');
  if (linkedTaskCount > 0) return inactive('ISSUE_LINKED');
  if (issue.state !== 'closed') return inactive('ISSUE_REOPENED');
  return active;
}

export function subjectCode(type, subject) {
  if (type === TASK_ALERT) return `TASK-${subject.id}`;
  if (type === PULL_REQUEST_ALERT) return `PR #${subject.number}`;
  return `Issue #${subject.number}`;
}

export function truncateTitle(title) {
  return Array.from(String(title ?? ''))
    .slice(0, SUBJECT_TITLE_MAX_LENGTH)
    .join('');
}

export function subjectSnapshot(type, subject) {
  return { subjectCode: subjectCode(type, subject), subjectTitle: truncateTitle(subject.title) };
}

export function taskCompletionInstant(historyEntries = []) {
  let latest = null;
  for (const entry of historyEntries) {
    if (entry.field !== 'STATUS' || entry.toValue !== 'CONCLUIDO') continue;
    const time = instant(entry.occurredAt);
    if (time !== null && (latest === null || time > latest)) latest = time;
  }
  return latest === null ? null : new Date(latest);
}

export function alertOccurredAt(type, subject, completionInstant = null) {
  if (type === TASK_ALERT) return completionInstant;
  if (type === PULL_REQUEST_ALERT) return subject.mergedAtGithub ?? null;
  return subject.closedAtGithub ?? null;
}

function noticeStateOf(type) {
  return type === TASK_ALERT ? 'NOT_APPLICABLE' : 'PENDING';
}

export function alertCreateData({ projectId, type, subject, occurredAt, detectedAt }) {
  return {
    projectId,
    type,
    status: 'OPEN',
    dedupeKey: alertDedupeKey(type, subject.id),
    [ALERT_SUBJECTS[type].foreignKey]: subject.id,
    ...subjectSnapshot(type, subject),
    occurredAt: occurredAt ?? null,
    detectedAt,
    noticeState: noticeStateOf(type)
  };
}

export function sortAlertCandidates(candidates) {
  return candidates.toSorted((a, b) => {
    const left = instant(a.occurredAt);
    const right = instant(b.occurredAt);
    if (left !== right) {
      if (left === null) return -1;
      if (right === null) return 1;
      return left - right;
    }
    return (
      subjectIdFromDedupeKey(a.dedupeKey) - subjectIdFromDedupeKey(b.dedupeKey) ||
      a.type.localeCompare(b.type)
    );
  });
}

export function alertLimitations(alert) {
  if (alert.occurredAt) return [];
  if (alert.type === TASK_ALERT) return [COMPLETION_TIME_UNAVAILABLE];
  if (alert.type === ISSUE_ALERT) return [CLOSE_TIME_UNAVAILABLE];
  return [];
}
