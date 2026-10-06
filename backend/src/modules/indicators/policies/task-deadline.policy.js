import { createIndicatorLocalDateKey } from './indicator-period.policy.js';

// Deadline stores a civil date in the UTC date part, not an expiration instant.
// SQL can compare against this boundary without relying on the database timezone.
export function taskDeadlineCutoff(referenceDate, timeZone = 'UTC') {
  const day = createIndicatorLocalDateKey(timeZone)(referenceDate);
  return new Date(`${day}T00:00:00.000Z`);
}

export function isTaskOverdue({ deadline, status, referenceDate, timeZone = 'UTC' }) {
  if (!deadline || status === 'CONCLUIDO') return false;
  const date = deadline instanceof Date ? deadline : new Date(deadline);
  return Number.isFinite(date.getTime()) && date < taskDeadlineCutoff(referenceDate, timeZone);
}
