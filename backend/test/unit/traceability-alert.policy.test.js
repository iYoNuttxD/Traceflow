import { describe, expect, it } from 'vitest';
import {
  ALERT_SUBJECTS,
  COMPLETION_TIME_UNAVAILABLE,
  ISSUE_ALERT,
  PULL_REQUEST_ALERT,
  SUBJECT_TITLE_MAX_LENGTH,
  TASK_ALERT,
  TRACEABILITY_ALERT_TYPES,
  alertCreateData,
  alertDedupeKey,
  alertLimitations,
  alertOccurredAt,
  evaluateIssueAlert,
  evaluatePullRequestAlert,
  evaluateTaskAlert,
  sortAlertCandidates,
  subjectIdFromDedupeKey,
  subjectSnapshot,
  taskCompletionInstant,
  truncateTitle
} from '../../src/modules/traceability/traceability-alert.policy.js';

const cutoff = new Date('2026-08-01T12:00:00.000Z');
const before = new Date('2026-08-01T11:59:59.999Z');

describe('S2-01 política de alertas: tarefa concluída sem commit (RF13)', () => {
  it.each([
    [
      'concluída, sem commit, com integração',
      { task: { status: 'CONCLUIDO' }, commitCount: 0, integrationExists: true },
      { active: true, resolutionReason: null }
    ],
    [
      'tarefa excluída',
      { task: null, commitCount: 0, integrationExists: true },
      { active: false, resolutionReason: 'TASK_DELETED' }
    ],
    [
      'commit vinculado',
      { task: { status: 'CONCLUIDO' }, commitCount: 1, integrationExists: true },
      { active: false, resolutionReason: 'COMMIT_LINKED' }
    ],
    [
      'tarefa reaberta',
      { task: { status: 'EM_ANDAMENTO' }, commitCount: 0, integrationExists: true },
      { active: false, resolutionReason: 'TASK_REOPENED' }
    ],
    [
      'projeto sem integração GitHub',
      { task: { status: 'CONCLUIDO' }, commitCount: 0, integrationExists: false },
      { active: false, resolutionReason: 'RULE_NO_LONGER_APPLIES' }
    ]
  ])('%s', (_, input, expected) => {
    expect(evaluateTaskAlert(input)).toEqual(expected);
  });

  it('segue a precedência TASK_DELETED, COMMIT_LINKED, TASK_REOPENED, RULE_NO_LONGER_APPLIES', () => {
    expect(evaluateTaskAlert({ task: null, commitCount: 3, integrationExists: false })).toEqual({
      active: false,
      resolutionReason: 'TASK_DELETED'
    });
    expect(
      evaluateTaskAlert({ task: { status: 'A_FAZER' }, commitCount: 2, integrationExists: false })
    ).toEqual({ active: false, resolutionReason: 'COMMIT_LINKED' });
    expect(
      evaluateTaskAlert({ task: { status: 'A_FAZER' }, commitCount: 0, integrationExists: false })
    ).toEqual({ active: false, resolutionReason: 'TASK_REOPENED' });
  });
});

describe('S2-01 política de alertas: PR mesclada sem tarefa (RF39)', () => {
  it.each([
    [
      'mesclada depois do corte, sem tarefa',
      { pullRequest: { mergedAtGithub: cutoff }, linkedTaskCount: 0, cutoff },
      { active: true, resolutionReason: null }
    ],
    [
      'mesclada exatamente no instante do corte',
      { pullRequest: { mergedAtGithub: new Date(cutoff) }, linkedTaskCount: 0, cutoff },
      { active: true, resolutionReason: null }
    ],
    [
      'mesclada um milissegundo antes do corte',
      { pullRequest: { mergedAtGithub: before }, linkedTaskCount: 0, cutoff },
      { active: false, resolutionReason: 'RULE_NO_LONGER_APPLIES' }
    ],
    [
      'fechada sem merge',
      {
        pullRequest: { state: 'closed', mergedAtGithub: null, closedAtGithub: cutoff },
        linkedTaskCount: 0,
        cutoff
      },
      { active: false, resolutionReason: 'RULE_NO_LONGER_APPLIES' }
    ],
    [
      'vinculada a uma tarefa',
      { pullRequest: { mergedAtGithub: cutoff }, linkedTaskCount: 2, cutoff },
      { active: false, resolutionReason: 'PULL_REQUEST_LINKED' }
    ],
    [
      'PR inexistente',
      { pullRequest: null, linkedTaskCount: 0, cutoff },
      { active: false, resolutionReason: 'RULE_NO_LONGER_APPLIES' }
    ]
  ])('%s', (_, input, expected) => {
    expect(evaluatePullRequestAlert(input)).toEqual(expected);
  });

  it('aceita instantes em texto ISO', () => {
    expect(
      evaluatePullRequestAlert({
        pullRequest: { mergedAtGithub: '2026-08-02T00:00:00.000Z' },
        cutoff: '2026-08-01T12:00:00.000Z'
      }).active
    ).toBe(true);
  });
});

describe('S2-01 política de alertas: issue fechada sem tarefa (RF40)', () => {
  it.each([
    [
      'fechada depois do corte, sem tarefa',
      { issue: { state: 'closed', closedAtGithub: cutoff }, linkedTaskCount: 0, cutoff },
      { active: true, resolutionReason: null }
    ],
    [
      'fechada antes do corte',
      { issue: { state: 'closed', closedAtGithub: before }, linkedTaskCount: 0, cutoff },
      { active: false, resolutionReason: 'RULE_NO_LONGER_APPLIES' }
    ],
    [
      'fechada sem closedAtGithub',
      { issue: { state: 'closed', closedAtGithub: null }, linkedTaskCount: 0, cutoff },
      { active: false, resolutionReason: 'RULE_NO_LONGER_APPLIES' }
    ],
    [
      'reaberta',
      { issue: { state: 'open', closedAtGithub: cutoff }, linkedTaskCount: 0, cutoff },
      { active: false, resolutionReason: 'ISSUE_REOPENED' }
    ],
    [
      'estado com caixa diferente não é normalizado',
      { issue: { state: 'CLOSED', closedAtGithub: cutoff }, linkedTaskCount: 0, cutoff },
      { active: false, resolutionReason: 'ISSUE_REOPENED' }
    ],
    [
      'vinculada a uma tarefa',
      { issue: { state: 'closed', closedAtGithub: cutoff }, linkedTaskCount: 1, cutoff },
      { active: false, resolutionReason: 'ISSUE_LINKED' }
    ],
    [
      'issue inexistente',
      { issue: null, linkedTaskCount: 0, cutoff },
      { active: false, resolutionReason: 'RULE_NO_LONGER_APPLIES' }
    ]
  ])('%s', (_, input, expected) => {
    expect(evaluateIssueAlert(input)).toEqual(expected);
  });

  it('segue a precedência ISSUE_LINKED, ISSUE_REOPENED, RULE_NO_LONGER_APPLIES', () => {
    expect(
      evaluateIssueAlert({
        issue: { state: 'open', closedAtGithub: before },
        linkedTaskCount: 1,
        cutoff
      }).resolutionReason
    ).toBe('ISSUE_LINKED');
    expect(
      evaluateIssueAlert({ issue: { state: 'open', closedAtGithub: before }, cutoff })
        .resolutionReason
    ).toBe('ISSUE_REOPENED');
  });
});

describe('S2-01 política de alertas: chave, snapshot e datas', () => {
  it('monta e lê a chave de deduplicação', () => {
    expect(alertDedupeKey(TASK_ALERT, 42)).toBe('TASK_CONCLUDED_WITHOUT_COMMIT:42');
    expect(subjectIdFromDedupeKey('ISSUE_CLOSED_WITHOUT_TASK:7')).toBe(7);
    expect(subjectIdFromDedupeKey('ISSUE_CLOSED_WITHOUT_TASK:x')).toBeNull();
    for (const type of TRACEABILITY_ALERT_TYPES)
      expect(alertDedupeKey(type, 2147483647).length).toBeLessThanOrEqual(64);
  });

  it('gera o código de exibição de cada sujeito', () => {
    expect(subjectSnapshot(TASK_ALERT, { id: 12, title: 'Login' })).toEqual({
      subjectCode: 'TASK-12',
      subjectTitle: 'Login'
    });
    expect(subjectSnapshot(PULL_REQUEST_ALERT, { id: 3, number: 45, title: 'Ajusta CI' })).toEqual({
      subjectCode: 'PR #45',
      subjectTitle: 'Ajusta CI'
    });
    expect(subjectSnapshot(ISSUE_ALERT, { id: 4, number: 7, title: 'Erro' }).subjectCode).toBe(
      'Issue #7'
    );
  });

  it('trunca o título em 191 caracteres sem partir caracteres compostos', () => {
    const emoji = '😀'.repeat(SUBJECT_TITLE_MAX_LENGTH + 5);
    expect(Array.from(truncateTitle(emoji))).toHaveLength(SUBJECT_TITLE_MAX_LENGTH);
    expect(truncateTitle('a'.repeat(300))).toHaveLength(SUBJECT_TITLE_MAX_LENGTH);
    expect(truncateTitle(null)).toBe('');
  });

  it('usa a última conclusão do histórico e não inventa data sem histórico', () => {
    const entries = [
      { field: 'STATUS', toValue: 'CONCLUIDO', occurredAt: '2026-09-01T10:00:00.000Z' },
      { field: 'STATUS', toValue: 'A_FAZER', occurredAt: '2026-09-02T10:00:00.000Z' },
      { field: 'STATUS', toValue: 'CONCLUIDO', occurredAt: '2026-09-03T10:00:00.000Z' },
      { field: 'DEADLINE', toValue: 'CONCLUIDO', occurredAt: '2026-09-09T10:00:00.000Z' }
    ];
    expect(taskCompletionInstant(entries)).toEqual(new Date('2026-09-03T10:00:00.000Z'));
    expect(taskCompletionInstant([])).toBeNull();
  });

  it('escolhe o instante do fato conforme o tipo', () => {
    const merged = new Date('2026-09-01T00:00:00.000Z');
    expect(alertOccurredAt(TASK_ALERT, {}, null)).toBeNull();
    expect(alertOccurredAt(PULL_REQUEST_ALERT, { mergedAtGithub: merged })).toBe(merged);
    expect(alertOccurredAt(ISSUE_ALERT, { closedAtGithub: merged })).toBe(merged);
  });

  it('monta a linha de criação com a FK do tipo e o snapshot', () => {
    const detectedAt = new Date('2026-10-07T00:00:00.000Z');
    expect(
      alertCreateData({
        projectId: 9,
        type: PULL_REQUEST_ALERT,
        subject: { id: 3, number: 45, title: 'Ajusta CI' },
        occurredAt: cutoff,
        detectedAt
      })
    ).toEqual({
      projectId: 9,
      type: PULL_REQUEST_ALERT,
      status: 'OPEN',
      dedupeKey: 'PULL_REQUEST_MERGED_WITHOUT_TASK:3',
      pullRequestId: 3,
      subjectCode: 'PR #45',
      subjectTitle: 'Ajusta CI',
      occurredAt: cutoff,
      detectedAt
    });
    expect(Object.keys(ALERT_SUBJECTS)).toEqual([...TRACEABILITY_ALERT_TYPES]);
  });

  it('ordena candidatos por fato (nulos primeiro) e depois pelo sujeito, de forma estável', () => {
    const candidate = (type, id, occurredAt) => ({
      type,
      dedupeKey: alertDedupeKey(type, id),
      occurredAt
    });
    const sorted = sortAlertCandidates([
      candidate(ISSUE_ALERT, 5, '2026-09-02T00:00:00.000Z'),
      candidate(TASK_ALERT, 9, null),
      candidate(TASK_ALERT, 2, '2026-09-01T00:00:00.000Z'),
      candidate(PULL_REQUEST_ALERT, 2, '2026-09-01T00:00:00.000Z'),
      candidate(TASK_ALERT, 1, null)
    ]);
    expect(sorted.map((row) => row.dedupeKey)).toEqual([
      'TASK_CONCLUDED_WITHOUT_COMMIT:1',
      'TASK_CONCLUDED_WITHOUT_COMMIT:9',
      'PULL_REQUEST_MERGED_WITHOUT_TASK:2',
      'TASK_CONCLUDED_WITHOUT_COMMIT:2',
      'ISSUE_CLOSED_WITHOUT_TASK:5'
    ]);
  });

  it('declara a limitação de data só para tarefa sem instante de conclusão', () => {
    expect(alertLimitations({ type: TASK_ALERT, occurredAt: null })).toEqual([
      COMPLETION_TIME_UNAVAILABLE
    ]);
    expect(alertLimitations({ type: TASK_ALERT, occurredAt: cutoff })).toEqual([]);
    expect(alertLimitations({ type: ISSUE_ALERT, occurredAt: null })).toEqual([]);
  });
});
