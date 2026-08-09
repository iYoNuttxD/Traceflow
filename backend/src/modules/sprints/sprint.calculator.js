// Funcoes puras de data e derivacao do cronograma (RF10).
// Sem Prisma, sem Express, sem I/O. O "hoje" e sempre injetado por parametro
// para permitir teste deterministico; nunca chamar new Date() aqui dentro.

const MS_PER_DAY = 86400000;

// Normaliza qualquer instante para o inicio do dia em UTC.
// Datas de cronograma sao dias de calendario, nao instantes.
export function toUtcDay(value) {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

// Duracao inclusiva: uma sprint que comeca e termina no mesmo dia dura 1 dia.
export function durationInDays(startDate, endDate) {
  const start = toUtcDay(startDate);
  const end = toUtcDay(endDate);
  if (start === null || end === null) return null;
  return Math.floor((end - start) / MS_PER_DAY) + 1;
}

// Prazo da tarefa fora da janela da sprint. Tarefa sem prazo nunca esta fora.
export function isDeadlineOutsideWindow(deadline, startDate, endDate) {
  const target = toUtcDay(deadline);
  if (target === null) return false;
  const start = toUtcDay(startDate);
  const end = toUtcDay(endDate);
  if (start === null || end === null) return false;
  return target < start || target > end;
}

// Marco atrasado: pendente e com data prevista anterior a hoje.
// Vencer hoje nao e atraso.
export function isMilestoneOverdue(status, dueDate, today) {
  if (status !== 'PENDENTE') return false;
  const due = toUtcDay(dueDate);
  const reference = toUtcDay(today);
  if (due === null || reference === null) return false;
  return due < reference;
}

// Sprint entra no recorte quando seu intervalo intersecta a janela pedida.
// Sem janela, tudo entra.
export function intersectsRange(startDate, endDate, from, to) {
  const start = toUtcDay(startDate);
  const end = toUtcDay(endDate);
  const rangeStart = toUtcDay(from);
  const rangeEnd = toUtcDay(to);
  if (start === null || end === null) return false;
  if (rangeStart !== null && end < rangeStart) return false;
  if (rangeEnd !== null && start > rangeEnd) return false;
  return true;
}

// Data isolada dentro da janela. Usada por marcos e por prazos de tarefas sem sprint.
export function isWithinRange(value, from, to) {
  const target = toUtcDay(value);
  if (target === null) return false;
  const rangeStart = toUtcDay(from);
  const rangeEnd = toUtcDay(to);
  if (rangeStart !== null && target < rangeStart) return false;
  if (rangeEnd !== null && target > rangeEnd) return false;
  return true;
}

// Serializa uma data de calendario como YYYY-MM-DD, sem componente de hora.
export function toDateOnlyString(value) {
  const day = toUtcDay(value);
  if (day === null) return null;
  return new Date(day).toISOString().slice(0, 10);
}
