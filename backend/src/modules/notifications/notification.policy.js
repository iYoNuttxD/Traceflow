export const NOTIFICATION_TYPES = Object.freeze(['TASK_STATUS_CHANGED', 'TASK_OVERDUE']);
export const STATUS_CHANGED = 'TASK_STATUS_CHANGED';
export const OVERDUE = 'TASK_OVERDUE';

export const NOTIFICATION_EXCLUSIONS = Object.freeze([
  'OUTSIDE_WINDOW',
  'NO_RESPONSIBLE',
  'SELF_CHANGE',
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

export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone });
    return true;
  } catch {
    return false;
  }
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

export function overdueCutoff(dueDate, timeZone) {
  return startOfLocalDay(addDays(dueDate, 1), timeZone);
}

export function isOverdue({ status, dueDate }, now, timeZone) {
  if (!dueDate || status === CONCLUDED) return false;
  return now.getTime() >= overdueCutoff(dueDate, timeZone).getTime();
}

export function lookbackStart(now, lookbackDays) {
  return new Date(now.getTime() - lookbackDays * DAY_MS);
}

export function isWithinLookback(cutoff, now, lookbackDays) {
  return cutoff.getTime() >= lookbackStart(now, lookbackDays).getTime();
}

export function dueDateRange(now, timeZone, lookbackDays) {
  let maxDueDate = localDateOf(now, timeZone);
  while (overdueCutoff(maxDueDate, timeZone).getTime() > now.getTime()) {
    maxDueDate = addDays(maxDueDate, -1);
  }
  let minDueDate = addDays(localDateOf(lookbackStart(now, lookbackDays), timeZone), -2);
  while (!isWithinLookback(overdueCutoff(minDueDate, timeZone), now, lookbackDays)) {
    minDueDate = addDays(minDueDate, 1);
  }
  return { minDueDate, maxDueDate };
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
  if (candidate.responsibleUserId === candidate.actorUserId) return 'SELF_CHANGE';
  return recipientExclusion(candidate);
}

export function overdueExclusion(candidate) {
  if (!candidate.withinWindow) return 'OUTSIDE_WINDOW';
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

export function notificationCoverage({ delivered, eligible }) {
  if (!eligible) return null;
  return Math.round((delivered / eligible) * 10000) / 100;
}
