import { preferenceAllowsOverdue } from './notification.policy.js';

export const ISSUE_EVENT = 'ISSUE_EVENT';
export const PULL_REQUEST_EVENT = 'PULL_REQUEST_EVENT';

export const GITHUB_EVENT_TYPES = Object.freeze([
  'ISSUE_CLOSED',
  'ISSUE_REOPENED',
  'PULL_REQUEST_MERGED',
  'PULL_REQUEST_CLOSED'
]);

export const GITHUB_EVENT_EXCLUSIONS = Object.freeze([
  'NO_TASK',
  'NO_PARTICIPANT',
  'PROJECT_DELETED',
  'OUTSIDE_WINDOW',
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

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const GITHUB_URL_PREFIX = 'https://github.com/';
const NOTIFICATION_TYPE_BY_EVENT = new Map([
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

function closedAgain(previous, incoming) {
  const before = asDate(previous.closedAtGithub);
  const after = asDate(incoming.closedAtGithub);
  return Boolean(before && after && before.getTime() !== after.getTime());
}

export function issueTransition(previous, incoming) {
  if (!previous || !incoming) return null;
  const from = normalizeIssueState(previous.state);
  const to = normalizeIssueState(incoming.state);
  if (!from || !to) return null;
  if (to === 'CLOSED' && (from === 'OPEN' || closedAgain(previous, incoming)))
    return { type: 'ISSUE_CLOSED', occurredAt: asDate(incoming.closedAtGithub) };
  if (from === 'CLOSED' && to === 'OPEN')
    return { type: 'ISSUE_REOPENED', occurredAt: asDate(incoming.updatedAtGithub) };
  return null;
}

export function pullRequestTransition(previous, incoming) {
  if (!previous || !incoming) return null;
  const from = normalizePullRequestState(previous);
  const to = normalizePullRequestState(incoming);
  if (!from || !to || from === 'MERGED') return null;
  if (to === 'MERGED')
    return { type: 'PULL_REQUEST_MERGED', occurredAt: asDate(incoming.mergedAtGithub) };
  if (to === 'CLOSED' && (from === 'OPEN' || closedAgain(previous, incoming)))
    return { type: 'PULL_REQUEST_CLOSED', occurredAt: asDate(incoming.closedAtGithub) };
  return null;
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

export function occurrenceKey({ type, artifactId, occurredAt, detectedAt }) {
  return `${type}:${artifactId}:${(occurredAt ?? detectedAt).toISOString()}`;
}

export function githubEventDedupeKey(notificationType, eventId, taskId) {
  return `${notificationType}:event:${eventId}:task:${taskId}`;
}

export function isWithinWindow({ occurredAt, detectedAt }, lookbackDays) {
  if (!occurredAt) return true;
  return occurredAt.getTime() >= detectedAt.getTime() - lookbackDays * DAY_MS;
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

export function eventExclusion({ projectDeleted, withinWindow }) {
  if (projectDeleted) return 'PROJECT_DELETED';
  if (!withinWindow) return 'OUTSIDE_WINDOW';
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
