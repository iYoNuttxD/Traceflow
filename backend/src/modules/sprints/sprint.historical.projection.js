const DAY = 86400000;
const MAX_DAYS = 180;
const TERMINAL = new Set(['CONCLUIDA', 'CANCELADA']);

const instant = (value) => (value == null ? null : new Date(value).getTime());
const utcDay = (value) => {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};
const hours = (value) => Math.round(value * 10) / 10;
const compareEvents = (a, b) => instant(a.occurredAt) - instant(b.occurredAt) || a.id - b.id;

function contribution(task) {
  if (!task?.inside) return { scope: 0, done: 0, unknown: 0 };
  if (task.points == null) return { scope: 0, done: 0, unknown: 1 };
  return {
    scope: Number(task.points),
    done: task.status === 'CONCLUIDO' ? Number(task.points) : 0,
    unknown: 0
  };
}

export function buildSprintHistoricalProjection({ sprint, events = [], cutoff = new Date() }) {
  const coverageStartedAt = sprint.burnupCoverageStartedAt;
  const empty = (state, limitations) => ({
    state,
    points: [],
    coverage: {
      startedAt: coverageStartedAt?.toISOString?.() ?? null,
      complete: false,
      truncated: false
    },
    limitations
  });
  if (!sprint.startedAt) return empty('NO_DATA', ['SPRINT_NOT_STARTED']);
  if (!coverageStartedAt) return empty('UNAVAILABLE', ['BURNUP_HISTORY_NOT_CAPTURED']);

  const start = Math.max(instant(sprint.startedAt), instant(coverageStartedAt));
  const firstDay = utcDay(start);
  const nominalEnd = instant(sprint.endDate);
  const dayCount = Math.min(MAX_DAYS, Math.max(1, Math.ceil((nominalEnd - firstDay) / DAY)));
  const truncated = nominalEnd > firstDay + dayCount * DAY;
  const complete = instant(coverageStartedAt) <= instant(sprint.startedAt);
  const closedAt = instant(sprint.closedAt ?? sprint.completedAt);
  const measuredUntil = TERMINAL.has(sprint.status) ? closedAt : instant(cutoff);
  if (measuredUntil == null) return empty('UNAVAILABLE', ['BURNUP_CUTOFF_UNKNOWN']);

  let ordered = events;
  for (let i = 1; i < events.length; i += 1) {
    if (compareEvents(events[i - 1], events[i]) > 0) {
      ordered = [...events].sort(compareEvents);
      break;
    }
  }
  const tasks = new Map();
  let scope = 0;
  let done = 0;
  let unknown = 0;
  let eventIndex = 0;
  let hadUniverse = false;
  let hadUnknown = false;
  let inconsistent = false;
  const points = [];

  for (let i = 0; i < dayCount; i += 1) {
    const day = firstDay + i * DAY;
    const dayEnd = day + DAY;
    while (eventIndex < ordered.length && instant(ordered[eventIndex].occurredAt) < dayEnd) {
      const event = ordered[eventIndex++];
      if (instant(event.occurredAt) > measuredUntil) continue;
      const before = tasks.get(event.taskKey);
      const old = contribution(before);
      let after;
      switch (event.type) {
        case 'BASELINE_TASK':
        case 'TASK_ADDED':
          if (before?.inside) inconsistent = true;
          after = { inside: true, points: event.newPoints, status: event.toStatus };
          hadUniverse = true;
          break;
        case 'TASK_REMOVED':
          if (!before?.inside || before.points !== event.previousPoints) inconsistent = true;
          after = { ...before, inside: false };
          break;
        case 'ESTIMATE_CHANGED':
          if (!before?.inside || before.points !== event.previousPoints) inconsistent = true;
          after = { ...before, points: event.newPoints };
          break;
        case 'STATUS_CHANGED':
          if (!before?.inside || before.status !== event.fromStatus) inconsistent = true;
          after = { ...before, status: event.toStatus };
          break;
        default:
          inconsistent = true;
          after = before;
      }
      const next = contribution(after);
      scope += next.scope - old.scope;
      done += next.done - old.done;
      unknown += next.unknown - old.unknown;
      if (scope < -1e-9 || done < -1e-9 || done > scope + 1e-9 || unknown < 0) {
        inconsistent = true;
      }
      tasks.set(event.taskKey, after);
    }
    const measured = day <= utcDay(measuredUntil);
    if (unknown > 0 && measured) hadUnknown = true;
    const known = measured && unknown === 0;
    points.push({
      date: new Date(day).toISOString().slice(0, 10),
      scope: known ? hours(scope) : null,
      completed: known ? hours(done) : null,
      remaining: known ? hours(scope - done) : null
    });
  }

  const limitations = [
    ...(!complete ? ['BURNUP_COVERAGE_STARTED_MID_SPRINT'] : []),
    ...(hadUnknown ? ['BURNUP_ESTIMATE_UNKNOWN'] : []),
    ...(truncated ? ['BURNUP_MAX_180_DAYS'] : []),
    ...(inconsistent ? ['BURNUP_EVENT_SEQUENCE_INCONSISTENT'] : [])
  ];
  return {
    state: inconsistent
      ? 'UNAVAILABLE'
      : !hadUniverse
        ? 'NO_DATA'
        : limitations.length
          ? 'PARTIAL'
          : 'AVAILABLE',
    points: inconsistent || !hadUniverse ? [] : points,
    coverage: {
      startedAt: coverageStartedAt.toISOString(),
      complete,
      truncated
    },
    limitations
  };
}
