export const NOTIFICATION_TYPES = Object.freeze([
  'TASK_STATUS_CHANGED',
  'TASK_OVERDUE',
  'ISSUE_EVENT',
  'PULL_REQUEST_EVENT',
  'TRACEABILITY_INCONSISTENCY'
]);
export const STATUS_CHANGED = 'TASK_STATUS_CHANGED';
export const OVERDUE = 'TASK_OVERDUE';
export const INCONSISTENCY = 'TRACEABILITY_INCONSISTENCY';
export const NOTIFICATION_GROUPS = Object.freeze({
  TASKS: Object.freeze([STATUS_CHANGED, OVERDUE]),
  GITHUB: Object.freeze(['ISSUE_EVENT', 'PULL_REQUEST_EVENT']),
  INCONSISTENCIES: Object.freeze([INCONSISTENCY])
});

export const NOTIFICATION_EXCLUSIONS = Object.freeze([
  'NO_RESPONSIBLE',
  'INACTIVE_ACCOUNT',
  'INACTIVE_MEMBER',
  'PREFERENCE_OFF'
]);

export const TITLE_MAX_LENGTH = 191;
const CONCLUDED = 'CONCLUIDO';
const DAY_MS = 86_400_000;
const formatters = new Map();

function formatterFor(timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(
      timeZone,
      new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
      })
    );
  }
  return formatters.get(timeZone);
}

function wallClock(instant, timeZone) {
  const parts = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(instant)
      .map((part) => [part.type, part.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    asUtc: Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    )
  };
}

function offsetAt(instantMs, timeZone) {
  const flooredMs = Math.floor(instantMs / 1000) * 1000;
  return wallClock(new Date(flooredMs), timeZone).asUtc - flooredMs;
}

export function addDays(dateText, days) {
  const [year, month, day] = dateText.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function localDateOf(instant, timeZone) {
  return wallClock(new Date(instant), timeZone).date;
}

function firstInstantOnOrAfter(dateText, timeZone, midnightAsUtc) {
  let before = midnightAsUtc - 2 * DAY_MS;
  let after = midnightAsUtc + 2 * DAY_MS;
  while (after - before > 1) {
    const middle = Math.floor((before + after) / 2);
    if (localDateOf(middle, timeZone) >= dateText) after = middle;
    else before = middle;
  }
  return after;
}

export function startOfLocalDay(dateText, timeZone) {
  const [year, month, day] = dateText.split('-').map(Number);
  const midnightAsUtc = Date.UTC(year, month - 1, day);
  const first = midnightAsUtc - offsetAt(midnightAsUtc, timeZone);
  const second = midnightAsUtc - offsetAt(first, timeZone);
  const startsTheDay = (candidate) =>
    localDateOf(candidate, timeZone) === dateText &&
    localDateOf(candidate - 1, timeZone) !== dateText;
  const valid = [first, second].filter(startsTheDay);
  return new Date(
    valid.length ? Math.min(...valid) : firstInstantOnOrAfter(dateText, timeZone, midnightAsUtc)
  );
}

export function dueDateOf(deadline) {
  if (deadline === null || deadline === undefined) return null;
  return new Date(deadline).toISOString().slice(0, 10);
}

const cutoffCache = new Map();
const CUTOFF_CACHE_LIMIT = 10_000;

export function overdueCutoff(dueDate, timeZone) {
  const key = `${timeZone}|${dueDate}`;
  const cached = cutoffCache.get(key);
  if (cached !== undefined) return new Date(cached);
  const cutoff = startOfLocalDay(addDays(dueDate, 1), timeZone);
  if (cutoffCache.size >= CUTOFF_CACHE_LIMIT) cutoffCache.clear();
  cutoffCache.set(key, cutoff.getTime());
  return cutoff;
}

export function isOverdue({ status, dueDate }, now, timeZone) {
  if (!dueDate || status === CONCLUDED) return false;
  return now.getTime() >= overdueCutoff(dueDate, timeZone).getTime();
}

export function latestOverdueDueDate(now, timeZone) {
  let dueDate = localDateOf(now, timeZone);
  while (overdueCutoff(dueDate, timeZone).getTime() > now.getTime()) {
    dueDate = addDays(dueDate, -1);
  }
  return dueDate;
}

export function statusChangeDedupeKey(movementId) {
  return `${STATUS_CHANGED}:movement:${movementId}`;
}

export function overdueDedupeKey(taskId, dueDate) {
  return `${OVERDUE}:${taskId}:${dueDate}`;
}

export function preferenceAllowsOverdue(preference, cutoff) {
  if (!preference) return true;
  if (!preference.enabled) return false;
  return !preference.enabledAt || preference.enabledAt.getTime() <= cutoff.getTime();
}

function recipientExclusion({
  responsibleUserId,
  accountActive,
  membershipActive,
  preferenceEnabled
}) {
  if (!accountActive) return 'INACTIVE_ACCOUNT';
  if (!membershipActive) return 'INACTIVE_MEMBER';
  if (!preferenceEnabled) return 'PREFERENCE_OFF';
  return responsibleUserId ? null : 'NO_RESPONSIBLE';
}

export function statusChangeExclusion(candidate) {
  if (!candidate.responsibleUserId) return 'NO_RESPONSIBLE';
  return recipientExclusion(candidate);
}

export function overdueExclusion(candidate) {
  if (!candidate.responsibleUserId) return 'NO_RESPONSIBLE';
  return recipientExclusion(candidate);
}

export function notificationLink(projectId, taskId) {
  return taskId ? `/projects/${projectId}/kanban?task=${taskId}` : null;
}

export function snapshotTitle(title) {
  return Array.from(String(title ?? ''))
    .slice(0, TITLE_MAX_LENGTH)
    .join('');
}
