import { preferenceAllowsOverdue } from './notification.policy.js';

export const ISSUE_EVENT = 'ISSUE_EVENT';
export const PULL_REQUEST_EVENT = 'PULL_REQUEST_EVENT';

export const GITHUB_EVENT_TYPES = Object.freeze([
  'ISSUE_LINKED',
  'ISSUE_CLOSED',
  'ISSUE_REOPENED',
  'PULL_REQUEST_MERGED',
  'PULL_REQUEST_CLOSED'
]);

export const GITHUB_EVENT_EXCLUSIONS = Object.freeze([
  'NO_TASK',
  'NO_PARTICIPANT',
  'INACTIVE_ACCOUNT',
  'INACTIVE_MEMBER',
  'PREFERENCE_OFF'
]);

export const ARTIFACT_TITLE_MAX_LENGTH = 256;
export const ARTIFACT_URL_MAX_LENGTH = 512;
export const MAX_DISPATCH_ATTEMPTS = 5;
export const RETRY_DELAYS_MINUTES = Object.freeze([1, 5, 30, 120]);
export const CLAIM_LEASE_MS = 120_000;
export const DISPATCH_BATCH_SIZE = 100;
export const JOB_MAX_BATCHES = 10;
export const MERGE_CLOSE_WINDOW_MS = 5000;
export const COVERAGE_MARGIN_MS = 300_000;

const MINUTE_MS = 60_000;
const GITHUB_URL_PREFIX = 'https://github.com/';
const NOTIFICATION_TYPE_BY_EVENT = new Map([
  ['ISSUE_LINKED', ISSUE_EVENT],
  ['ISSUE_CLOSED', ISSUE_EVENT],
  ['ISSUE_REOPENED', ISSUE_EVENT],
  ['PULL_REQUEST_MERGED', PULL_REQUEST_EVENT],
  ['PULL_REQUEST_CLOSED', PULL_REQUEST_EVENT]
]);
const ARTIFACT_KIND_BY_TYPE = new Map([
  [ISSUE_EVENT, 'ISSUE'],
  [PULL_REQUEST_EVENT, 'PULL_REQUEST']
]);

function asDate(value) {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeIssueState(state) {
  if (typeof state !== 'string') return null;
  const value = state.toLowerCase();
  if (value === 'open') return 'OPEN';
  if (value === 'closed') return 'CLOSED';
  return null;
}

export function normalizePullRequestState(pullRequest) {
  const state = normalizeIssueState(pullRequest?.state);
  if (state === 'CLOSED' && asDate(pullRequest.mergedAtGithub)) return 'MERGED';
  return state;
}

const ISSUE_EVENT_TYPES = new Map([
  ['CLOSED', 'ISSUE_CLOSED'],
  ['REOPENED', 'ISSUE_REOPENED']
]);

export function issueEventTypeOf(eventType) {
  return ISSUE_EVENT_TYPES.get(eventType) ?? null;
}

const NUMERIC_EVENT_ID = /^\d{1,30}$/;

function sequenceOf({ occurredAt, providerEventId }) {
  const id = String(providerEventId ?? '');
  return {
    time: asDate(occurredAt).getTime(),
    id: NUMERIC_EVENT_ID.test(id) ? BigInt(id) : null
  };
}

function compareSequence(left, right) {
  if (left.time !== right.time) return left.time < right.time ? -1 : 1;
  if (left.id === null || right.id === null || left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

function reopenedBetween(reopenings, closing, merge) {
  const [start, end] = compareSequence(closing, merge) <= 0 ? [closing, merge] : [merge, closing];
  return reopenings.some(
    (reopening) => compareSequence(reopening, start) >= 0 && compareSequence(reopening, end) <= 0
  );
}

export function mergeClosingsOf(history, mergedAtGithub = null) {
  const events = history.map((event) => ({ ...event, sequence: sequenceOf(event) }));
  const merges = events.filter((event) => event.eventType === 'MERGED');
  const snapshot = asDate(mergedAtGithub);
  if (
    snapshot &&
    !merges.some(
      (merge) => Math.abs(merge.sequence.time - snapshot.getTime()) <= MERGE_CLOSE_WINDOW_MS
    )
  )
    merges.push({ sequence: { time: snapshot.getTime(), id: null } });
  const reopenings = events
    .filter((event) => event.eventType === 'REOPENED')
    .map((event) => event.sequence);
  const closings = events.filter((event) => event.eventType === 'CLOSED');
  const absorbed = new Set();
  for (const merge of merges) {
    const distance = (closing) => Math.abs(closing.sequence.time - merge.sequence.time);
    const pair = closings
      .filter(
        (closing) =>
          !absorbed.has(String(closing.providerEventId)) &&
          distance(closing) <= MERGE_CLOSE_WINDOW_MS &&
          !reopenedBetween(reopenings, closing.sequence, merge.sequence)
      )
      .sort(
        (left, right) =>
          distance(left) - distance(right) || compareSequence(right.sequence, left.sequence)
      )[0];
    if (pair) absorbed.add(String(pair.providerEventId));
  }
  return absorbed;
}

export function pullRequestEventTypeOf({ eventType, providerEventId }, absorbed = new Set()) {
  if (eventType === 'MERGED') return 'PULL_REQUEST_MERGED';
  if (eventType !== 'CLOSED') return null;
  return absorbed.has(String(providerEventId)) ? null : 'PULL_REQUEST_CLOSED';
}

export function linkedTasksAt(periods, occurredAt) {
  const instant = asDate(occurredAt).getTime();
  const covering = periods.filter(
    (period) =>
      asDate(period.linkedAt).getTime() <= instant &&
      (period.unlinkedAt
        ? instant < asDate(period.unlinkedAt).getTime()
        : Number.isInteger(period.taskId))
  );
  const taskIds = [
    ...new Set(covering.map((period) => period.taskId).filter(Number.isInteger))
  ].sort((left, right) => left - right);
  return {
    count: taskIds.length + covering.filter((period) => period.taskId === null).length,
    taskIds
  };
}

export function lifecycleOccurrenceKey(providerEventId) {
  return `gh:${providerEventId}`;
}

export function linkedOccurrenceKey(issueId, taskId) {
  return `linked:${issueId}:task:${taskId}`;
}

export function completeThroughOf(readStartedAt) {
  return new Date(asDate(readStartedAt).getTime() - COVERAGE_MARGIN_MS);
}

export function pullRequestStateAnomaly(previous, incoming) {
  if (!previous || !incoming) return false;
  const to = normalizePullRequestState(incoming);
  return normalizePullRequestState(previous) === 'MERGED' && (to === 'OPEN' || to === 'CLOSED');
}

export function notificationTypeOf(eventType) {
  return NOTIFICATION_TYPE_BY_EVENT.get(eventType) ?? null;
}

export function artifactKindOf(notificationType) {
  return ARTIFACT_KIND_BY_TYPE.get(notificationType) ?? null;
}

export function githubEventDedupeKey(notificationType, eventId, taskId) {
  return `${notificationType}:event:${eventId}:task:${taskId}`;
}

export function taskParticipants({ responsibleUserId, commentAuthorIds = [], effortUserIds = [] }) {
  const ids = new Set();
  for (const id of [responsibleUserId, ...commentAuthorIds, ...effortUserIds])
    if (Number.isInteger(id)) ids.add(id);
  return [...ids].sort((left, right) => left - right);
}

export function participantExclusion({ accountActive, membershipActive, preferenceAllowed }) {
  if (!accountActive) return 'INACTIVE_ACCOUNT';
  if (!membershipActive) return 'INACTIVE_MEMBER';
  if (!preferenceAllowed) return 'PREFERENCE_OFF';
  return null;
}

export function preferenceAllowsEvent(preference, detectedAt) {
  return preferenceAllowsOverdue(preference, detectedAt);
}

export function nextAttemptAfterFailure(attempts, now) {
  if (attempts >= MAX_DISPATCH_ATTEMPTS) return null;
  const delay = RETRY_DELAYS_MINUTES[Math.max(attempts, 1) - 1];
  return new Date(now.getTime() + delay * MINUTE_MS);
}

export function snapshotArtifactTitle(title) {
  return Array.from(String(title ?? ''))
    .slice(0, ARTIFACT_TITLE_MAX_LENGTH)
    .join('');
}

export function safeGithubUrl(value) {
  return typeof value === 'string' &&
    value.length <= ARTIFACT_URL_MAX_LENGTH &&
    value.startsWith(GITHUB_URL_PREFIX)
    ? value
    : null;
}

export function emptyOutcome() {
  return {
    tasks: 0,
    participants: 0,
    eligible: 0,
    created: 0,
    alreadyNotified: 0,
    excluded: Object.fromEntries(GITHUB_EVENT_EXCLUSIONS.map((reason) => [reason, 0]))
  };
}
