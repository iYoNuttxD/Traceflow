import { COVERAGE_MARGIN_MS, linkedTasksAt } from './github-event.policy.js';
import { dueDateOf, overdueCutoff } from './notification.policy.js';

export const SENT = 'SENT';
export const NO_RESPONSIBLE = 'NO_RESPONSIBLE';
export const AUTHORIZED_REASONS = Object.freeze([
  'PREFERENCE_OFF',
  'INACTIVE_ACCOUNT',
  'INACTIVE_MEMBER'
]);
export const GITHUB_NO_RECIPIENT_REASONS = Object.freeze(['NO_PARTICIPANT', 'NO_TASK']);

export const CALCULATED = 'CALCULADA';
export const UNAVAILABLE = 'INDISPONIVEL';
export const NO_EVENTS = 'SEM_EVENTOS';
export const UNOBSERVED_EVENTS = 'EVENTOS_NAO_OBSERVADOS';
export const INCOMPLETE_RECORD = 'REGISTRO_INCOMPLETO';
export const STATE_COMPARISON_SOURCE = 'FONTE_POR_COMPARACAO_DE_ESTADO';
export const ACQUISITION_GAP = 'LACUNA_DE_AQUISICAO';
export const ACQUISITION_MATCH_MS = 5000;
export const PRESUMED_SOURCE = 'PRESUMIDA';
export const PRESUMED_SOURCE_RULE =
  'completo até o início da última leitura completa menos a margem; o GitHub não garante a completude da listagem';

export const TOTAL_FORMULA = 'enviadasCorretamente / ocorridos × 100';
export const ELIGIBLE_FORMULA =
  'enviadasCorretamente / (ocorridos − naoEnviadas − semDestinatario) × 100';

const CONCLUDED = 'CONCLUIDO';
const DISPATCHED = 'DISPATCHED';

export function statusChangeEventKey(movementId) {
  return `movement:${movementId}`;
}

export function overdueEventKey(taskId, dueDate) {
  return `${taskId}:${dueDate}`;
}

export function recipientKeyOf(recipientUserId) {
  return recipientUserId ?? 0;
}

export function overdueDecisionInstant(cutoff, createdAt) {
  return createdAt && createdAt.getTime() > cutoff.getTime() ? createdAt : cutoff;
}

function percentage(part, whole) {
  return Math.round((part / whole) * 10000) / 100;
}

function coverage(value, reason) {
  return reason
    ? { valor: null, situacao: UNAVAILABLE, motivo: reason }
    : { valor: value, situacao: CALCULATED, motivo: null };
}

export function notificationCoverages({
  occurred,
  sent,
  notSent,
  noRecipient,
  unobserved,
  gaps = []
}) {
  const blocked = gaps[0] ?? (unobserved > 0 ? UNOBSERVED_EVENTS : null);
  const eligible = occurred - notSent - noRecipient;
  const total = blocked ?? (occurred > 0 ? null : NO_EVENTS);
  const auxiliary = blocked ?? (eligible > 0 ? null : NO_EVENTS);
  return {
    coberturaTotal: {
      ...coverage(total ? null : percentage(sent, occurred), total),
      formula: TOTAL_FORMULA
    },
    coberturaElegivel: {
      ...coverage(auxiliary ? null : percentage(sent, eligible), auxiliary),
      formula: ELIGIBLE_FORMULA,
      auxiliar: true
    }
  };
}

const laterThan = (row, current) =>
  row.decidedAt.getTime() > current.decidedAt.getTime() ||
  (row.decidedAt.getTime() === current.decidedAt.getTime() && row.id > current.id);

export function decisionsByEvent(rows) {
  const events = new Map();
  for (const row of rows) {
    const current = events.get(row.eventKey);
    if (!current) {
      events.set(row.eventKey, { ...row });
      continue;
    }
    if (row.occurredAt.getTime() < current.occurredAt.getTime())
      current.occurredAt = row.occurredAt;
    if (current.outcome === SENT || !(row.outcome === SENT || laterThan(row, current))) continue;
    Object.assign(current, { id: row.id, outcome: row.outcome, decidedAt: row.decidedAt });
  }
  return events;
}

function emptyTally(noRecipientReasons) {
  return {
    ocorridos: 0,
    enviadasCorretamente: 0,
    naoEnviadas: {
      total: 0,
      ...Object.fromEntries(AUTHORIZED_REASONS.map((reason) => [reason, 0]))
    },
    semDestinatario: {
      total: 0,
      ...Object.fromEntries(noRecipientReasons.map((reason) => [reason, 0]))
    },
    naoEnviadasSemMotivoAutorizado: { total: 0 },
    naoObservados: 0
  };
}

function add(group, reason, amount) {
  group.total += amount;
  group[reason] = (group[reason] ?? 0) + amount;
}

export function tallyDecidedEvents(eventKeys, decided) {
  const tally = emptyTally([NO_RESPONSIBLE]);
  for (const key of eventKeys) {
    tally.ocorridos += 1;
    const outcome = decided.get(key)?.outcome;
    if (!outcome) tally.naoObservados += 1;
    else if (outcome === SENT) tally.enviadasCorretamente += 1;
    else if (outcome === NO_RESPONSIBLE) add(tally.semDestinatario, outcome, 1);
    else add(tally.naoEnviadas, outcome, 1);
  }
  return tally;
}

export function githubEventTally(events) {
  const tally = { eventos: events.length, ...emptyTally(GITHUB_NO_RECIPIENT_REASONS) };
  const unauthorized = tally.naoEnviadasSemMotivoAutorizado;
  for (const { status, outcome } of events) {
    if (status !== DISPATCHED || !outcome) {
      tally.ocorridos += 1;
      tally.naoObservados += 1;
      continue;
    }
    const excluded = outcome.excluded ?? {};
    const sent = (outcome.created ?? 0) + (outcome.alreadyNotified ?? 0);
    let pending =
      (outcome.participants ?? 0) + (excluded.NO_PARTICIPANT ?? 0) + (excluded.NO_TASK ?? 0);
    tally.ocorridos += pending;
    tally.enviadasCorretamente += sent;
    pending -= sent;
    for (const [reason, amount] of Object.entries(excluded)) {
      if (!amount) continue;
      if (AUTHORIZED_REASONS.includes(reason)) add(tally.naoEnviadas, reason, amount);
      else if (GITHUB_NO_RECIPIENT_REASONS.includes(reason))
        add(tally.semDestinatario, reason, amount);
      else {
        unauthorized[reason] = (unauthorized[reason] ?? 0) + amount;
        continue;
      }
      pending -= amount;
    }
    unauthorized.total += pending;
  }
  return tally;
}

export function requirementReport(unit, tally, gaps) {
  return {
    unidade: unit,
    ...tally,
    lacunas: gaps,
    ...notificationCoverages({
      occurred: tally.ocorridos,
      sent: tally.enviadasCorretamente,
      notSent: tally.naoEnviadas.total,
      noRecipient: tally.semDestinatario.total,
      unobserved: tally.naoObservados,
      gaps: gaps.map((gap) => gap.motivo)
    })
  };
}

export function githubCoverageGaps(coverages, period) {
  const start = period.start.getTime();
  const end = period.end.getTime();
  const before = [];
  const after = [];
  for (const { projectId, coverageFrom, comparedBefore, completeThrough } of coverages) {
    if (!comparedBefore && end <= coverageFrom.getTime()) continue;
    if (comparedBefore && start < coverageFrom.getTime())
      before.push({
        motivo: STATE_COMPARISON_SOURCE,
        projeto: projectId,
        coberturaDesde: coverageFrom.toISOString()
      });
    if (!completeThrough || end > completeThrough.getTime())
      after.push({
        motivo: ACQUISITION_GAP,
        projeto: projectId,
        completoAte: completeThrough ? completeThrough.toISOString() : null
      });
  }
  return [...before, ...after];
}

export function presumedSourceCoverage() {
  return {
    tipo: PRESUMED_SOURCE,
    margemMinutos: COVERAGE_MARGIN_MS / 60_000,
    regra: PRESUMED_SOURCE_RULE
  };
}

function groupedBy(rows, keyOf) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

const artifactKey = (kind, id) => `${kind}:${id}`;

function snapshotsOf({ pullRequests, issues }) {
  return [
    ...pullRequests.map((row) => ({
      kind: 'PULL_REQUEST',
      id: row.id,
      projectId: row.projectId,
      number: row.number,
      expected: row.mergedAtGithub ? 'MERGED' : 'CLOSED',
      occurredAt: row.mergedAtGithub ?? row.closedAtGithub
    })),
    ...issues.map((row) => ({
      kind: 'ISSUE',
      id: row.id,
      projectId: row.projectId,
      number: row.number,
      expected: 'CLOSED',
      occurredAt: row.closedAtGithub
    }))
  ];
}

const byInstantAndNumber = (left, right) =>
  left.ocorridoEm.localeCompare(right.ocorridoEm) || left.artefato.numero - right.artefato.numero;

export function acquisitionGaps(source, coverages, period) {
  const coverageOf = new Map(coverages.map((row) => [row.projectId, row]));
  const periods = groupedBy(source.periods, (row) =>
    row.pullRequestId
      ? artifactKey('PULL_REQUEST', row.pullRequestId)
      : artifactKey('ISSUE', row.issueId)
  );
  const events = groupedBy(
    [
      ...source.pullRequestEvents.map((row) => ({
        ...row,
        key: artifactKey('PULL_REQUEST', row.pullRequestId)
      })),
      ...source.issueEvents.map((row) => ({ ...row, key: artifactKey('ISSUE', row.issueId) }))
    ],
    (row) => row.key
  );
  const gaps = { PULL_REQUEST: [], ISSUE: [] };
  for (const snapshot of snapshotsOf(source)) {
    const instant = snapshot.occurredAt.getTime();
    const coverage = coverageOf.get(snapshot.projectId);
    if (!coverage?.completeThrough) continue;
    if (instant < coverage.coverageFrom.getTime() || instant > coverage.completeThrough.getTime())
      continue;
    if (instant < period.start.getTime() || instant >= period.end.getTime()) continue;
    const key = artifactKey(snapshot.kind, snapshot.id);
    if (!linkedTasksAt(periods.get(key) ?? [], snapshot.occurredAt).count) continue;
    const recorded = (events.get(key) ?? []).some(
      (event) =>
        event.eventType === snapshot.expected &&
        Math.abs(event.occurredAt.getTime() - instant) <= ACQUISITION_MATCH_MS
    );
    if (recorded) continue;
    gaps[snapshot.kind].push({
      motivo: ACQUISITION_GAP,
      projeto: snapshot.projectId,
      artefato: { tipo: snapshot.kind, numero: snapshot.number },
      esperado: snapshot.expected,
      ocorridoEm: snapshot.occurredAt.toISOString()
    });
  }
  return {
    RF60: gaps.ISSUE.sort(byInstantAndNumber),
    RF61: gaps.PULL_REQUEST.sort(byInstantAndNumber)
  };
}

export function incompleteRecordGaps(registryStart, retentionHorizon, periodStart) {
  if (!registryStart) return [{ motivo: INCOMPLETE_RECORD, completoDesde: null }];
  const completeSince = Math.max(registryStart.getTime(), retentionHorizon.getTime());
  if (completeSince <= periodStart.getTime()) return [];
  return [{ motivo: INCOMPLETE_RECORD, completoDesde: new Date(completeSince).toISOString() }];
}

const instantOf = (entry) => new Date(entry.occurredAt).getTime();

export function overdueOccurrences(task, entries, { timeZone, until }) {
  const changes = entries
    .filter((entry) => entry.field === 'DEADLINE' || entry.field === 'STATUS')
    .sort((left, right) => instantOf(left) - instantOf(right));
  const firstDeadline = changes.find((entry) => entry.field === 'DEADLINE');
  const firstStatus = changes.find((entry) => entry.field === 'STATUS');
  let deadline = firstDeadline ? firstDeadline.fromValue : task.deadline;
  let status = firstStatus ? firstStatus.fromValue : task.status;
  const apply = (entry) => {
    if (entry.field === 'DEADLINE') deadline = entry.toValue;
    else status = entry.toValue;
  };

  const limit = new Date(until).getTime();
  const occurrences = new Map();
  let start = new Date(task.createdAt).getTime();
  let index = 0;
  while (index < changes.length && instantOf(changes[index]) <= start) apply(changes[index++]);
  while (start <= limit) {
    const end = index < changes.length ? instantOf(changes[index]) : Infinity;
    const dueDate = dueDateOf(deadline);
    if (dueDate && status !== CONCLUDED && !occurrences.has(dueDate)) {
      const instant = Math.max(start, overdueCutoff(dueDate, timeZone).getTime());
      if (instant < end && instant <= limit) occurrences.set(dueDate, new Date(instant));
    }
    if (end === Infinity) break;
    start = end;
    while (index < changes.length && instantOf(changes[index]) === start) apply(changes[index++]);
  }
  return occurrences;
}
