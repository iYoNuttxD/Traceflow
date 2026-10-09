import { describe, expect, it } from 'vitest';
import {
  COMPLETION_TIME_UNAVAILABLE,
  ISSUE_ALERT,
  PULL_REQUEST_ALERT,
  SUBJECT_TITLE_MAX_LENGTH,
  TASK_ALERT,
  alertDedupeKey,
  alertLimitations,
  alertOccurredAt,
  evaluateIssueAlert,
  evaluatePullRequestAlert,
  evaluateTaskAlert,
  sortAlertCandidates,
  subjectIdFromDedupeKey,
  taskCompletionInstant,
  truncateTitle
} from '../../src/modules/traceability/traceability-alert.policy.js';

const cutoff = new Date('2026-08-01T12:00:00.000Z');
const at = (delta) => new Date(cutoff.getTime() + delta);
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function product(...lists) {
  return lists.reduce(
    (rows, list) => rows.flatMap((row) => list.map((item) => [...row, item])),
    [[]]
  );
}

function expectedTask({ task, commitCount, integrationExists }) {
  if (!task) return { active: false, resolutionReason: 'TASK_DELETED' };
  if (task.status === 'CONCLUIDO' && commitCount === 0 && integrationExists)
    return { active: true, resolutionReason: null };
  if (commitCount > 0) return { active: false, resolutionReason: 'COMMIT_LINKED' };
  if (task.status !== 'CONCLUIDO') return { active: false, resolutionReason: 'TASK_REOPENED' };
  return { active: false, resolutionReason: 'RULE_NO_LONGER_APPLIES' };
}

const insideCutoff = (value) => value !== null && Date.parse(value) >= cutoff.getTime();

function expectedPullRequest({ pullRequest, linkedTaskCount }) {
  if (!pullRequest) return { active: false, resolutionReason: 'RULE_NO_LONGER_APPLIES' };
  if (linkedTaskCount > 0) return { active: false, resolutionReason: 'PULL_REQUEST_LINKED' };
  if (insideCutoff(pullRequest.mergedAtGithub)) return { active: true, resolutionReason: null };
  return { active: false, resolutionReason: 'RULE_NO_LONGER_APPLIES' };
}

function expectedIssue({ issue, linkedTaskCount }) {
  if (!issue) return { active: false, resolutionReason: 'RULE_NO_LONGER_APPLIES' };
  if (linkedTaskCount > 0) return { active: false, resolutionReason: 'ISSUE_LINKED' };
  if (issue.state !== 'closed') return { active: false, resolutionReason: 'ISSUE_REOPENED' };
  if (insideCutoff(issue.closedAtGithub)) return { active: true, resolutionReason: null };
  return { active: false, resolutionReason: 'RULE_NO_LONGER_APPLIES' };
}

const instants = [
  null,
  at(-1),
  at(0),
  at(1),
  at(0).toISOString(),
  at(-1).toISOString(),
  'não-é-data'
];

describe('Bateria S2-01 unidade — tabela de decisão do RF13 (AT-T-01)', () => {
  const rows = [
    ...product(['A_FAZER', 'EM_ANDAMENTO', 'CONCLUIDO'], [0, 1, 2], [true, false], [null, 7]).map(
      ([status, commitCount, integrationExists, pullRequestId]) => ({
        task: { status, pullRequestId },
        commitCount,
        integrationExists
      })
    ),
    ...product([0, 1], [true, false]).map(([commitCount, integrationExists]) => ({
      task: null,
      commitCount,
      integrationExists
    }))
  ];

  it.each(rows.map((row) => [JSON.stringify(row), row]))('%s', (_, input) => {
    expect(evaluateTaskAlert(input)).toEqual(expectedTask(input));
  });

  it('a PR vinculada nunca muda o resultado do RF13', () => {
    for (const [status, commitCount, integrationExists] of product(
      ['A_FAZER', 'CONCLUIDO'],
      [0, 1],
      [true, false]
    ))
      expect(
        evaluateTaskAlert({ task: { status, pullRequestId: 9 }, commitCount, integrationExists })
      ).toEqual(evaluateTaskAlert({ task: { status }, commitCount, integrationExists }));
  });
});

describe('Bateria S2-01 unidade — tabela de decisão do RF39 (AT-G-01)', () => {
  const rows = [
    ...product([0, 1, 2], instants, ['closed', 'open']).map(
      ([linkedTaskCount, mergedAtGithub, state]) => ({
        pullRequest: { state, mergedAtGithub },
        linkedTaskCount,
        cutoff
      })
    ),
    { pullRequest: null, linkedTaskCount: 0, cutoff }
  ];

  it.each(rows.map((row) => [JSON.stringify(row), row]))('%s', (_, input) => {
    expect(evaluatePullRequestAlert(input)).toEqual(expectedPullRequest(input));
  });

  it('o corte também vale com o projeto informado em texto ISO', () => {
    expect(
      evaluatePullRequestAlert({
        pullRequest: { mergedAtGithub: at(0) },
        linkedTaskCount: 0,
        cutoff: cutoff.toISOString()
      })
    ).toEqual({ active: true, resolutionReason: null });
  });
});

describe('Bateria S2-01 unidade — tabela de decisão do RF40 (AT-G-02, AT-G-08)', () => {
  const rows = [
    ...product([0, 1], ['closed', 'open', 'CLOSED'], instants, ['completed', 'not_planned']).map(
      ([linkedTaskCount, state, closedAtGithub, stateReason]) => ({
        issue: { state, closedAtGithub, stateReason },
        linkedTaskCount,
        cutoff
      })
    ),
    { issue: null, linkedTaskCount: 0, cutoff }
  ];

  it.each(rows.map((row) => [JSON.stringify(row), row]))('%s', (_, input) => {
    expect(evaluateIssueAlert(input)).toEqual(expectedIssue(input));
  });

  it('"not planned" alerta como qualquer issue fechada', () => {
    const base = { linkedTaskCount: 0, cutoff };
    expect(
      evaluateIssueAlert({
        ...base,
        issue: { state: 'closed', closedAtGithub: at(5), stateReason: 'not_planned' }
      })
    ).toEqual(
      evaluateIssueAlert({
        ...base,
        issue: { state: 'closed', closedAtGithub: at(5), stateReason: 'completed' }
      })
    );
  });
});

describe('Bateria S2-01 unidade — instante do fato (AT-T-07)', () => {
  const concluded = (occurredAt) => ({ field: 'STATUS', toValue: 'CONCLUIDO', occurredAt });

  it('a conclusão mais recente vence em qualquer ordem do histórico', () => {
    const entries = [concluded(at(5000)), concluded(at(1000)), concluded(at(9000))];
    for (const order of [entries, [...entries].reverse(), [entries[1], entries[2], entries[0]]])
      expect(taskCompletionInstant(order)).toEqual(at(9000));
  });

  it('ignora outros campos, outros destinos e datas inválidas', () => {
    expect(
      taskCompletionInstant([
        { field: 'PRIORITY', toValue: 'CONCLUIDO', occurredAt: at(99999) },
        { field: 'STATUS', toValue: 'EM_ANDAMENTO', occurredAt: at(88888) },
        concluded('não-é-data'),
        concluded(null),
        concluded(at(10))
      ])
    ).toEqual(at(10));
    expect(taskCompletionInstant([])).toBeNull();
    expect(taskCompletionInstant()).toBeNull();
  });

  it('o fato de PR e issue vem do GitHub, e o da tarefa vem só do histórico', () => {
    const subject = { mergedAtGithub: at(1), closedAtGithub: at(2), updatedAt: at(3) };
    expect(alertOccurredAt(PULL_REQUEST_ALERT, subject)).toEqual(at(1));
    expect(alertOccurredAt(ISSUE_ALERT, subject)).toEqual(at(2));
    expect(alertOccurredAt(TASK_ALERT, subject)).toBeNull();
    expect(alertOccurredAt(TASK_ALERT, subject, at(4))).toEqual(at(4));
  });

  it('só alerta de tarefa sem data declara a limitação', () => {
    expect(alertLimitations({ type: TASK_ALERT, occurredAt: null })).toEqual([
      COMPLETION_TIME_UNAVAILABLE
    ]);
    expect(alertLimitations({ type: TASK_ALERT, occurredAt: at(0) })).toEqual([]);
    expect(alertLimitations({ type: PULL_REQUEST_ALERT, occurredAt: null })).toEqual([]);
    expect(alertLimitations({ type: ISSUE_ALERT, occurredAt: null })).toEqual([]);
  });
});

describe('Bateria S2-01 unidade — ordem de criação (AT-C-06)', () => {
  it('ordena por fato com nulos primeiro, depois pelo sujeito, sem alterar a entrada', () => {
    const candidate = (type, id, occurredAt) => ({
      type,
      occurredAt,
      dedupeKey: alertDedupeKey(type, id)
    });
    const input = [
      candidate(ISSUE_ALERT, 9, at(2000)),
      candidate(TASK_ALERT, 30, null),
      candidate(PULL_REQUEST_ALERT, 4, at(1000)),
      candidate(ISSUE_ALERT, 3, at(1000)),
      candidate(TASK_ALERT, 2, null),
      candidate(TASK_ALERT, 4, at(1000))
    ];
    const snapshot = JSON.stringify(input);

    const sorted = sortAlertCandidates(input);

    expect(JSON.stringify(input)).toBe(snapshot);
    expect(sorted.map((row) => row.dedupeKey)).toEqual([
      `${TASK_ALERT}:2`,
      `${TASK_ALERT}:30`,
      `${ISSUE_ALERT}:3`,
      `${PULL_REQUEST_ALERT}:4`,
      `${TASK_ALERT}:4`,
      `${ISSUE_ALERT}:9`
    ]);
  });

  it('chave de deduplicação malformada não vira sujeito válido', () => {
    for (const key of ['', 'TASK', 'TASK:', 'TASK:0', 'TASK:-3', 'TASK:1.5', 'TASK:abc'])
      expect(subjectIdFromDedupeKey(key), key).toBeNull();
    expect(subjectIdFromDedupeKey(`${TASK_ALERT}:42`)).toBe(42);
  });
});

describe('Bateria S2-01 unidade — snapshot do título (AT-T-11)', () => {
  it('nunca passa de 191 caracteres e nunca deixa par substituto partido', () => {
    const samples = [
      'a'.repeat(400),
      '\u{1F600}'.repeat(400),
      `${'a'.repeat(190)}\u{1F600}\u{1F600}`,
      `${'a'.repeat(190)}é`,
      `${'a'.repeat(189)}\u{1F468}‍\u{1F469}‍\u{1F467}`,
      ''
    ];
    for (const sample of samples) {
      const result = truncateTitle(sample);
      expect(Array.from(result).length).toBeLessThanOrEqual(SUBJECT_TITLE_MAX_LENGTH);
      expect(LONE_SURROGATE.test(result)).toBe(false);
      expect(sample.startsWith(result)).toBe(true);
    }
  });
});
