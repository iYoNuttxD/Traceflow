import { durationSample, median, roundMetric } from './statistics.calculator.js';

const DAY = 86400000;
const STATUS = new Set(['A_FAZER', 'EM_ANDAMENTO', 'CONCLUIDO']);

function daySequence(startDate, endDate, today, includeToday = false) {
  const days = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  while (cursor.toISOString().slice(0, 10) <= endDate) {
    const day = cursor.toISOString().slice(0, 10);
    if (day > today || (!includeToday && day === today)) break;
    days.push(day);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function sample(rows, unknownCount) {
  const durations = durationSample(rows, 'start', 'end', DAY);
  return {
    value: durations.eligibleCount ? roundMetric(median(durations.durations)) : null,
    eligibleCount: durations.eligibleCount,
    excludedCount: durations.excludedCount + unknownCount
  };
}

export function calculateFlowTaskHistory({ tasks, movements, period, asOf, dateKey }) {
  const byTask = new Map();
  for (const movement of movements) {
    const rows = byTask.get(movement.taskId) ?? [];
    rows.push(movement);
    byTask.set(movement.taskId, rows);
  }
  const leadRows = [];
  const cycleRows = [];
  const throughputByDay = new Map();
  const aging = [];
  let unknownCompletion = 0;
  let missingCycleStart = 0;
  let throughput = 0;
  let agingExcluded = 0;
  let flowEligible = 0;
  let flowExcluded = 0;
  const flowDeltas = new Map();
  const addDelta = (date, status, amount) => {
    const delta = flowDeltas.get(date) ?? { A_FAZER: 0, EM_ANDAMENTO: 0, CONCLUIDO: 0 };
    delta[status] += amount;
    flowDeltas.set(date, delta);
  };

  for (const task of tasks) {
    const rows = byTask.get(task.id) ?? [];
    const initialCompletionUnknown = rows[0]?.fromStatus === 'CONCLUIDO';
    const firstDone = initialCompletionUnknown
      ? null
      : rows.find((row) => row.toStatus === 'CONCLUIDO' && row.fromStatus !== 'CONCLUIDO');
    if (
      firstDone &&
      firstDone.movedAt >= period.startInclusive &&
      firstDone.movedAt < period.endExclusive
    ) {
      leadRows.push({ start: task.createdAt, end: firstDone.movedAt });
      const firstStart = rows.find(
        (row) =>
          row.toStatus === 'EM_ANDAMENTO' &&
          row.fromStatus !== 'EM_ANDAMENTO' &&
          row.movedAt >= task.createdAt &&
          row.movedAt <= firstDone.movedAt
      );
      if (firstStart) cycleRows.push({ start: firstStart.movedAt, end: firstDone.movedAt });
      else missingCycleStart++;
    } else if (
      !firstDone &&
      (initialCompletionUnknown || task.status === 'CONCLUIDO') &&
      task.createdAt < period.endExclusive
    ) {
      unknownCompletion++;
    }

    const latestAtCut = rows.filter((row) => row.movedAt < period.endExclusive).at(-1);
    if (
      latestAtCut?.toStatus === 'CONCLUIDO' &&
      latestAtCut.fromStatus !== 'CONCLUIDO' &&
      latestAtCut.movedAt >= period.startInclusive
    ) {
      throughput++;
      const day = dateKey(latestAtCut.movedAt);
      throughputByDay.set(day, (throughputByDay.get(day) ?? 0) + 1);
    }

    if (task.status === 'EM_ANDAMENTO') {
      const latest = rows.at(-1);
      if (latest?.toStatus === 'EM_ANDAMENTO' && latest.movedAt >= task.createdAt) {
        aging.push({
          taskId: task.id,
          title: task.title,
          enteredInProgressAt: latest.movedAt.toISOString(),
          agingDuration: roundMetric((asOf - latest.movedAt) / DAY),
          deadline: task.deadline?.toISOString() ?? null,
          responsible:
            task.responsibleUser?.isActive &&
            task.responsibleUser.accountStatus === 'ACTIVE' &&
            task.responsibleUser.anonymizedAt === null
              ? { userId: task.responsibleUser.id, name: task.responsibleUser.name }
              : null
        });
      } else agingExcluded++;
    }

    // Cumulative flow is an explicitly partial cohort of surviving Tasks with
    // an observed, internally consistent movement chain and initial state.
    const first = rows[0];
    let valid = Boolean(
      first &&
      task.createdAt <= asOf &&
      task.createdAt <= first.movedAt &&
      STATUS.has(first.fromStatus) &&
      rows.at(-1).toStatus === task.status
    );
    for (let index = 0; valid && index < rows.length; index++) {
      const row = rows[index];
      if (
        !STATUS.has(row.fromStatus) ||
        !STATUS.has(row.toStatus) ||
        (index > 0 && rows[index - 1].toStatus !== row.fromStatus)
      )
        valid = false;
    }
    if (!valid) {
      flowExcluded++;
      continue;
    }
    flowEligible++;
    addDelta(dateKey(task.createdAt), first.fromStatus, 1);
    for (const row of rows) {
      const date = dateKey(row.movedAt);
      addDelta(date, row.fromStatus, -1);
      addDelta(date, row.toStatus, 1);
    }
  }

  aging.sort((a, b) => b.agingDuration - a.agingDuration || a.taskId - b.taskId);
  const today = dateKey(asOf);
  const days = daySequence(period.startDate, period.endDate, today);
  const eventDays = daySequence(period.startDate, period.endDate, today, true);
  const balance = { A_FAZER: 0, EM_ANDAMENTO: 0, CONCLUIDO: 0 };
  for (const [date, delta] of flowDeltas) {
    if (date >= period.startDate) continue;
    for (const status of STATUS) balance[status] += delta[status];
  }
  const cumulativePoints = days.map((date) => {
    const delta = flowDeltas.get(date);
    if (delta) for (const status of STATUS) balance[status] += delta[status];
    return {
      date,
      todo: balance.A_FAZER,
      inProgress: balance.EM_ANDAMENTO,
      done: balance.CONCLUIDO
    };
  });
  return {
    lead: sample(leadRows, unknownCompletion),
    cycle: sample(cycleRows, unknownCompletion + missingCycleStart),
    throughput: {
      value: throughput,
      excludedCount: unknownCompletion,
      points: eventDays.map((date) => ({ date, value: throughputByDay.get(date) ?? 0 }))
    },
    aging: { value: aging.length, excludedCount: agingExcluded, items: aging.slice(0, 10) },
    cumulative: {
      points: cumulativePoints,
      eligibleCount: flowEligible,
      excludedCount: flowExcluded
    }
  };
}

export function taskStatusDistribution(rows) {
  const distribution = { A_FAZER: 0, EM_ANDAMENTO: 0, CONCLUIDO: 0 };
  let unknownCount = 0;
  for (const row of rows) {
    if (STATUS.has(row.status)) distribution[row.status] += row._count._all;
    else unknownCount += row._count._all;
  }
  return { ...distribution, unknownCount };
}
