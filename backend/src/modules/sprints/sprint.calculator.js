const MS_PER_DAY = 86400000;

function toInstant(value) {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

export function toUtcDay(value) {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function durationInDays(startDate, endDate) {
  const start = toInstant(startDate);
  const end = toInstant(endDate);
  if (start === null || end === null) return null;
  return Math.ceil((end - start) / MS_PER_DAY);
}

export function isDeadlineOutsideWindow(deadline, startDate, endDate) {
  const target = toInstant(deadline);
  if (target === null) return false;
  const start = toInstant(startDate);
  const end = toInstant(endDate);
  if (start === null || end === null) return false;
  return target < start || target >= end;
}

export function isMilestoneOverdue(status, dueDate, today) {
  if (status !== 'PENDENTE') return false;
  const due = toInstant(dueDate);
  const reference = toInstant(today);
  if (due === null || reference === null) return false;
  return due < reference;
}

export function intersectsRange(startDate, endDate, from, to) {
  const start = toInstant(startDate);
  const end = toInstant(endDate);
  const rangeStart = toInstant(from);
  const rangeEnd = toInstant(to);
  if (start === null || end === null) return false;
  if (rangeStart !== null && end <= rangeStart) return false;
  if (rangeEnd !== null && start >= rangeEnd) return false;
  return true;
}

export function isWithinRange(value, from, to) {
  const target = toInstant(value);
  if (target === null) return false;
  const rangeStart = toInstant(from);
  const rangeEnd = toInstant(to);
  if (rangeStart !== null && target < rangeStart) return false;
  if (rangeEnd !== null && target >= rangeEnd) return false;
  return true;
}

export function toIsoString(value) {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function toDateOnlyString(value) {
  const day = toUtcDay(value);
  if (day === null) return null;
  return new Date(day).toISOString().slice(0, 10);
}
