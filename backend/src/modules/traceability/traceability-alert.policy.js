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

export const SUBJECT_TITLE_MAX_LENGTH = 191;

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

function isAtOrAfter(value, cutoff) {
  const time = instant(value);
  const limit = instant(cutoff);
  return time !== null && limit !== null && time >= limit;
}

export function alertDedupeKey(type, subjectId) {
  return `${type}:${subjectId}`;
}

export function subjectIdFromDedupeKey(dedupeKey) {
  const id = Number(String(dedupeKey).split(':').at(-1));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function evaluateTaskAlert({ task, commitCount = 0, integrationExists }) {
  if (!task) return inactive('TASK_DELETED');
  if (commitCount > 0) return inactive('COMMIT_LINKED');
  if (task.status !== 'CONCLUIDO') return inactive('TASK_REOPENED');
  if (!integrationExists) return inactive('RULE_NO_LONGER_APPLIES');
  return active;
}

export function evaluatePullRequestAlert({ pullRequest, linkedTaskCount = 0, cutoff }) {
  if (!pullRequest) return inactive('RULE_NO_LONGER_APPLIES');
  if (linkedTaskCount > 0) return inactive('PULL_REQUEST_LINKED');
  if (!isAtOrAfter(pullRequest.mergedAtGithub, cutoff)) return inactive('RULE_NO_LONGER_APPLIES');
  return active;
}

export function evaluateIssueAlert({ issue, linkedTaskCount = 0, cutoff }) {
  if (!issue) return inactive('RULE_NO_LONGER_APPLIES');
  if (linkedTaskCount > 0) return inactive('ISSUE_LINKED');
  if (issue.state !== 'closed') return inactive('ISSUE_REOPENED');
  if (!isAtOrAfter(issue.closedAtGithub, cutoff)) return inactive('RULE_NO_LONGER_APPLIES');
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

export function alertCreateData({ projectId, type, subject, occurredAt, detectedAt }) {
  return {
    projectId,
    type,
    status: 'OPEN',
    dedupeKey: alertDedupeKey(type, subject.id),
    [ALERT_SUBJECTS[type].foreignKey]: subject.id,
    ...subjectSnapshot(type, subject),
    occurredAt: occurredAt ?? null,
    detectedAt
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
  return alert.type === TASK_ALERT && !alert.occurredAt ? [COMPLETION_TIME_UNAVAILABLE] : [];
}
