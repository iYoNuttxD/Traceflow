// Funcoes puras de data e derivacao do cronograma (RF10).
// Sem Prisma, sem Express, sem I/O. O "hoje" e sempre injetado por parametro
// para permitir teste deterministico; nunca chamar new Date() aqui dentro.
//
// Datas de cronograma sao INSTANTES (ADR-010 D05), e as comparacoes daqui
// operam sobre eles. A janela do filtro continua sendo dia de calendario, mas
// chega ja convertida em instantes pelo service — `to` como inicio do dia
// seguinte, exclusivo (D15).

const MS_PER_DAY = 86400000;

function toInstant(value) {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

// Normaliza um instante para o inicio do dia em UTC. Continua existindo porque
// a agenda ancora eventos em dias, mesmo que os campos guardem hora.
export function toUtcDay(value) {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

// Dias abrangidos pela janela semiaberta [inicio, fim), arredondados para cima.
// Deixou de ser contagem inclusiva de dias de calendario: com o fim exclusivo,
// 01/08 00:00 a 14/08 00:00 sao 13 dias, e nao 14 — o dia 14 pertence a sprint
// seguinte. Uma sprint de 13 dias e 9 horas conta como 14.
export function durationInDays(startDate, endDate) {
  const start = toInstant(startDate);
  const end = toInstant(endDate);
  if (start === null || end === null) return null;
  return Math.ceil((end - start) / MS_PER_DAY);
}

// Prazo da tarefa fora da janela da sprint. Tarefa sem prazo nunca esta fora.
export function isDeadlineOutsideWindow(deadline, startDate, endDate) {
  const target = toInstant(deadline);
  if (target === null) return false;
  const start = toInstant(startDate);
  const end = toInstant(endDate);
  if (start === null || end === null) return false;
  return target < start || target >= end;
}

// Marco atrasado: pendente e com data prevista ja passada.
export function isMilestoneOverdue(status, dueDate, today) {
  if (status !== 'PENDENTE') return false;
  const due = toInstant(dueDate);
  const reference = toInstant(today);
  if (due === null || reference === null) return false;
  return due < reference;
}

// Sprint entra no recorte quando seu intervalo intersecta a janela pedida.
// Sem janela, tudo entra. Ambos os intervalos sao semiabertos.
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

// Instante isolado dentro da janela. Usado por marcos e por prazos de tarefas
// sem sprint. `to` ja chega exclusivo.
export function isWithinRange(value, from, to) {
  const target = toInstant(value);
  if (target === null) return false;
  const rangeStart = toInstant(from);
  const rangeEnd = toInstant(to);
  if (rangeStart !== null && target < rangeStart) return false;
  if (rangeEnd !== null && target >= rangeEnd) return false;
  return true;
}

// Serializa um instante em ISO-8601 UTC. A conversao para o fuso do usuario e
// responsabilidade da apresentacao, nunca do armazenamento nem do contrato.
export function toIsoString(value) {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Dia de calendario em UTC, para os campos que continuam sendo dia: a janela
// `range` devolvida no agregado.
export function toDateOnlyString(value) {
  const day = toUtcDay(value);
  if (day === null) return null;
  return new Date(day).toISOString().slice(0, 10);
}
