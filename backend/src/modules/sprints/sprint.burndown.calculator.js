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

export function buildSprintBurndown({ sprint, participations = [], cutoff }) {
  const vazio = {
    hasData: false,
    totalPoints: 0,
    frozen: TERMINAL.includes(sprint.status),
    cutoffDate: null,
    days: []
  };

  const days = enumerateDays(sprint.startDate, sprint.endDate);
  if (days.length < 2) return vazio;

  const dentro = participations.filter((participation) => participation.removedAt === null);
  const totalPoints = dentro.reduce(
    (soma, participation) => soma + (Number(participation.points) || 0),
    0
  );
  if (totalPoints <= 0) return vazio;

  const frozen = TERMINAL.includes(sprint.status);
  const corte = frozen ? (toInstant(sprint.completedAt) ?? toInstant(cutoff)) : toInstant(cutoff);
  const diaDoCorte = toUtcDay(new Date(corte));

  const queimas = dentro
    .map((participation) => ({
      at: burnInstant(participation),
      points: Number(participation.points) || 0
    }))
    .filter((queima) => queima.at !== null);

  const ultimo = days.length - 1;
  return {
    hasData: true,
    totalPoints,
    frozen,
    cutoffDate:
      diaDoCorte >= days[0] && diaDoCorte <= days[ultimo]
        ? iso(diaDoCorte)
        : diaDoCorte > days[ultimo]
          ? iso(days[ultimo])
          : null,
    days: days.map((day, indice) => {
      const fimDoDia = day + MS_PER_DAY;
      const medido = day <= diaDoCorte;
      const queimado = medido
        ? queimas.reduce((soma, queima) => (queima.at < fimDoDia ? soma + queima.points : soma), 0)
        : 0;
      return {
        date: iso(day),
        ideal: Math.round(totalPoints * (1 - indice / ultimo) * 10) / 10,
        remaining: medido ? Math.max(0, totalPoints - queimado) : null
      };
    })
  };
}
