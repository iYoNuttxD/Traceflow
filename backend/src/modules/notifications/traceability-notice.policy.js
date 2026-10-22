import { safeGithubUrl } from './github-event.policy.js';
import { INCONSISTENCY } from './notification.policy.js';

export const BATCH_LIMIT = 10;

const PULL_REQUEST_ALERT = 'PULL_REQUEST_MERGED_WITHOUT_TASK';
const ISSUE_ALERT = 'ISSUE_CLOSED_WITHOUT_TASK';
const GITHUB_EVENT_BY_ALERT = new Map([
  [PULL_REQUEST_ALERT, 'PULL_REQUEST_MERGED'],
  [ISSUE_ALERT, 'ISSUE_CLOSED']
]);
const ARTIFACT_KIND_BY_EVENT = new Map([
  ['PULL_REQUEST_MERGED', 'PULL_REQUEST'],
  ['ISSUE_CLOSED', 'ISSUE']
]);

export function alertNoticeKey(alertId) {
  return `${INCONSISTENCY}:alert:${alertId}`;
}

export function batchNoticeKey(projectId, detectedAt) {
  return `${INCONSISTENCY}:batch:${projectId}:${detectedAt.getTime()}`;
}

export function noticeBatches(alerts) {
  const batches = new Map();
  for (const alert of alerts) {
    const key = alert.detectedAt.getTime();
    if (!batches.has(key)) batches.set(key, { detectedAt: alert.detectedAt, alerts: [] });
    batches.get(key).alerts.push(alert);
  }
  return [...batches.values()];
}

export function batchSummaryOf(alerts) {
  const pullRequests = alerts.filter((alert) => alert.type === PULL_REQUEST_ALERT).length;
  return { total: alerts.length, pullRequests, issues: alerts.length - pullRequests };
}

function artifactNumberOf(alert) {
  const number = Number(String(alert.subjectCode).split('#')[1]);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function noticeRows(projectId, batch, recipientIds) {
  const notice = (recipientUserId, dedupeKey) => ({
    recipientUserId,
    projectId,
    type: INCONSISTENCY,
    dedupeKey
  });
  if (batch.alerts.length > BATCH_LIMIT) {
    const batchSummary = batchSummaryOf(batch.alerts);
    const dedupeKey = batchNoticeKey(projectId, batch.detectedAt);
    return recipientIds.map((userId) => ({ ...notice(userId, dedupeKey), batchSummary }));
  }
  return batch.alerts.flatMap((alert) =>
    recipientIds.map((userId) => ({
      ...notice(userId, alertNoticeKey(alert.id)),
      traceabilityAlertId: alert.id,
      githubEvent: GITHUB_EVENT_BY_ALERT.get(alert.type),
      artifactNumber: artifactNumberOf(alert),
      artifactTitle: alert.subjectTitle,
      artifactUrl: safeGithubUrl((alert.pullRequest ?? alert.issue)?.githubUrl ?? null),
      githubOccurredAt: alert.occurredAt
    }))
  );
}

export function noticeLink(projectId, alertId) {
  return alertId
    ? `/projects/${projectId}/repository?alerta=${alertId}`
    : `/projects/${projectId}/repository?inconsistencia=OPEN`;
}

export function noticeContext(row) {
  const summary = row.batchSummary;
  const alert = row.traceabilityAlert;
  return {
    occurredAt: row.githubOccurredAt,
    artifact: summary
      ? null
      : {
          kind: ARTIFACT_KIND_BY_EVENT.get(row.githubEvent) ?? null,
          number: row.artifactNumber,
          title: row.artifactTitle,
          url: safeGithubUrl(row.artifactUrl)
        },
    alert: alert
      ? {
          id: alert.id,
          type: alert.type,
          status: alert.status,
          resolvedAt: alert.resolvedAt,
          dismissedAt: alert.dismissedAt
        }
      : null,
    batch: summary
      ? { total: summary.total, pullRequests: summary.pullRequests, issues: summary.issues }
      : null
  };
}
