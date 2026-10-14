import { summarizeSprintEstimates } from './sprint.estimate.calculator.js';
const MS_PER_DAY = 86400000;
const CONCLUIDO = 'CONCLUIDO';
const TERMINAL = ['CONCLUIDA', 'CANCELADA'];
const MAX_DAYS = 180;

function toUtcDay(value) {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function toInstant(value) {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

const iso = (day) => new Date(day).toISOString().slice(0, 10);

function enumerateDays(startDate, endDate) {
  const first = toUtcDay(startDate);
  const end = toInstant(endDate);
  if (first === null || end === null) return [];
  const days = [];
  for (let day = first; day < end && days.length < MAX_DAYS; day += MS_PER_DAY) {
    days.push(day);
  }
  return days;
}

const effectiveStatus = (participation) => participation.exitStatus ?? participation.currentStatus;

function burnInstant(participation) {
  const completed = toInstant(participation.completedAt);
  if (completed !== null) return completed;
  if (effectiveStatus(participation) === CONCLUIDO) return toInstant(participation.addedAt);
  return null;
}

export function buildSprintBurndown({ sprint, participations = [], cutoff, projection }) {
  if (sprint.burnupCoverageStartedAt) {
    const historical = projection ?? {
      state: 'UNAVAILABLE',
      points: [],
      limitations: ['BURNUP_HISTORY_NOT_LOADED'],
      coverage: { truncated: false }
    };
    const points = historical.points;
    const baseline = historical.baseline?.scope ?? null;
    const firstNominal = toUtcDay(sprint.startDate ?? sprint.startedAt);
    const nominalEnd = toInstant(sprint.endDate);
    const lastNominal = nominalEnd === null ? null : toUtcDay(nominalEnd - 1);
    const idealAt = (date) =>
      baseline === null || firstNominal == null || lastNominal == null
        ? null
        : Math.round(
            baseline *
              (firstNominal === lastNominal
                ? 1
                : Math.max(
                    0,
                    Math.min(1, 1 - (toUtcDay(date) - firstNominal) / (lastNominal - firstNominal))
                  )) *
              10
          ) / 10;
    const days = points.map(({ date, remaining }) => ({ date, ideal: idealAt(date), remaining }));
    const chartMax = Math.max(
      0,
      ...points.flatMap((point) => [point.scope, point.remaining]).filter(Number.isFinite),
      ...days.map((day) => day.ideal).filter(Number.isFinite)
    );
    const hasData =
      chartMax > 0 &&
      days.some((day) => Number.isFinite(day.remaining) || Number.isFinite(day.ideal));
    return {
      hasData,
      totalPoints: baseline,
      idealBaseline: baseline,
      chartMax,
      frozen: TERMINAL.includes(sprint.status),
      cutoffDate: points.findLast((point) => Number.isFinite(point.remaining))?.date ?? null,
      days,
      historicalState:
        historical.state === 'AVAILABLE' && baseline === null ? 'PARTIAL' : historical.state,
      historicalLimitations: [
        ...historical.limitations,
        ...(points.length && baseline === null ? ['BURNDOWN_BASELINE_UNAVAILABLE'] : [])
      ],
      truncated: historical.coverage.truncated
    };
  }
  const vazio = {
    hasData: false,
    totalPoints: 0,
    frozen: TERMINAL.includes(sprint.status),
    cutoffDate: null,
    days: []
  };

  const startedAt = toInstant(sprint.startedAt);
  const seriesStart = startedAt === null ? sprint.startDate : sprint.startedAt;
  const operational = startedAt !== null || sprint.status !== 'PLANEJADA';
  const days = enumerateDays(seriesStart, sprint.endDate);
  // An execution started on/after the nominal end still has a real first day.
  // Never backdate it to create a second chart point before startedAt.
  if (startedAt !== null && days.length === 0 && toInstant(sprint.endDate) !== null) {
    days.push(toUtcDay(startedAt));
  }
  if (days.length === 0 || (days.length < 2 && startedAt === null)) return vazio;

  const dentro = participations.filter((participation) => participation.removedAt === null);
  const estimates = summarizeSprintEstimates(dentro.map((participation) => participation.points));
  if (estimates.unknownEstimateCount)
    return {
      ...vazio,
      totalPoints: null,
      chartMax: 0,
      historicalState: 'PARTIAL',
      historicalLimitations: ['TASK_ESTIMATE_MISSING']
    };
  const totalPoints = estimates.value;
  if (totalPoints <= 0) return vazio;

  const frozen = TERMINAL.includes(sprint.status);
  const corte = !operational
    ? null
    : frozen
      ? (toInstant(sprint.closedAt) ??
        toInstant(sprint.completedAt) ??
        toInstant(sprint.updatedAt) ??
        toInstant(cutoff))
      : toInstant(cutoff);
  const diaDoCorte = corte === null ? null : toUtcDay(corte);

  const queimas = dentro
    .map((participation) => ({
      at: burnInstant(participation),
      points: participation.points
    }))
    .filter((queima) => queima.at !== null);

  const ultimo = days.length - 1;
  return {
    hasData: true,
    totalPoints,
    idealBaseline: totalPoints,
    chartMax: totalPoints,
    frozen,
    cutoffDate:
      diaDoCorte !== null && diaDoCorte >= days[0] && diaDoCorte <= days[ultimo]
        ? iso(diaDoCorte)
        : diaDoCorte !== null && diaDoCorte > days[ultimo]
          ? iso(days[ultimo])
          : null,
    days: days.map((day, indice) => {
      const fimDoDia = day + MS_PER_DAY;
      const medido = diaDoCorte !== null && day <= diaDoCorte;
      const queimado = medido
        ? queimas.reduce((soma, queima) => (queima.at < fimDoDia ? soma + queima.points : soma), 0)
        : 0;
      return {
        date: iso(day),
        ideal:
          ultimo === 0 ? totalPoints : Math.round(totalPoints * (1 - indice / ultimo) * 10) / 10,
        remaining: medido ? Math.max(0, totalPoints - queimado) : null
      };
    })
  };
}
