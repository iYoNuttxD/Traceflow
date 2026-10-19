import { describe, expect, it } from 'vitest';
import {
  ALERT_STATUSES,
  ALERT_TYPES,
  RESOLUTION_REASONS,
  alertFactText,
  alertHistoryDetail,
  alertHistoryTitle,
  alertStatusLabel,
  alertSubjectFilter,
  alertTypeLabel,
  formatInstant,
  historyToggleLabel,
  inconsistencyMetrics,
  reconciliationNotice,
  resolutionLabel,
  validateDismissReason
} from '../../src/features/traceability/model/alert-view.js';

const BACKEND_TYPES = [
  'TASK_CONCLUDED_WITHOUT_COMMIT',
  'PULL_REQUEST_MERGED_WITHOUT_TASK',
  'ISSUE_CLOSED_WITHOUT_TASK'
];
const BACKEND_STATUSES = ['OPEN', 'DISMISSED', 'RESOLVED'];
const BACKEND_REASONS = [
  'COMMIT_LINKED',
  'TASK_REOPENED',
  'TASK_DELETED',
  'PULL_REQUEST_LINKED',
  'ISSUE_LINKED',
  'ISSUE_REOPENED',
  'RULE_NO_LONGER_APPLIES'
];

describe('S2-01 vocabulário de alertas na interface', () => {
  it('tem rótulo para cada enum do backend', () => {
    expect(Object.keys(ALERT_TYPES)).toEqual(BACKEND_TYPES);
    expect(Object.keys(ALERT_STATUSES)).toEqual(BACKEND_STATUSES);
    expect(Object.keys(RESOLUTION_REASONS)).toEqual(BACKEND_REASONS);
    for (const type of BACKEND_TYPES) expect(alertTypeLabel(type)).not.toBe('Alerta');
    for (const status of BACKEND_STATUSES)
      expect(alertStatusLabel(status)).not.toBe('Situação indisponível');
    for (const reason of BACKEND_REASONS)
      expect(resolutionLabel(reason)).not.toBe('Motivo indisponível');
  });

  it('descreve a data do fato e a ausência dela sem inventar valor', () => {
    const occurredAt = '2026-10-05T17:32:00.000Z';
    expect(alertFactText({ type: 'PULL_REQUEST_MERGED_WITHOUT_TASK', occurredAt })).toBe(
      `Mesclada em ${formatInstant(occurredAt)}`
    );
    expect(alertFactText({ type: 'ISSUE_CLOSED_WITHOUT_TASK', occurredAt })).toBe(
      `Fechada em ${formatInstant(occurredAt)}`
    );
    expect(alertFactText({ type: 'TASK_CONCLUDED_WITHOUT_COMMIT', occurredAt: null })).toBe(
      'Data da conclusão indisponível'
    );
    expect(formatInstant(null)).toBe('');
  });

  it('resume as inconsistências abertas por tipo, com plural, milhar e destino filtrado (TF-REV-008, UX-R2-02)', () => {
    expect(inconsistencyMetrics(null, 9).map(({ count, text }) => [count, text])).toEqual([
      [null, ''],
      [null, ''],
      [null, '']
    ]);
    expect(
      inconsistencyMetrics(
        {
          open: {
            total: 1205,
            byType: { PULL_REQUEST_MERGED_WITHOUT_TASK: 1204, ISSUE_CLOSED_WITHOUT_TASK: 1 }
          }
        },
        9
      ).map(({ label, count, text, to }) => [label, count, text, to])
    ).toEqual([
      [
        'Tarefas concluídas sem commit',
        0,
        '0 tarefas concluídas sem commit',
        '/projects/9/tasks?rastreabilidade=SEM_COMMIT'
      ],
      [
        'PRs mescladas sem tarefa',
        1204,
        '1.204 PRs mescladas sem tarefa',
        '/projects/9/repository?inconsistencia=OPEN&tipo=pull_request'
      ],
      [
        'Issues fechadas sem tarefa',
        1,
        '1 issue fechada sem tarefa',
        '/projects/9/repository?inconsistencia=OPEN&tipo=issue'
      ]
    ]);
  });

  it('o aviso da reconciliação segue o estado e não manda ninguém clicar (UX-R3-03)', () => {
    const succeeded = '2026-10-07T10:00:00.000Z';
    const failed = '2026-10-08T10:00:00.000Z';
    const notices = [
      reconciliationNotice({ state: 'CURRENT', lastSucceededAt: succeeded }),
      reconciliationNotice({ state: 'PENDING_FIRST' }),
      reconciliationNotice({ state: 'STALE', lastSucceededAt: succeeded, lastFailedAt: failed }),
      reconciliationNotice({ state: 'STALE', lastSucceededAt: failed, lastFailedAt: succeeded })
    ];

    expect(notices).toEqual([
      '',
      'As inconsistências deste projeto ainda não foram calculadas.',
      `A última atualização das inconsistências falhou em ${formatInstant(failed)}. Os números podem estar desatualizados.`,
      `A última atualização das inconsistências foi em ${formatInstant(failed)}. Os números podem estar desatualizados.`
    ]);
    expect(reconciliationNotice(null)).toBe('');
    for (const notice of notices) expect(notice).not.toMatch(/Reprocessar|gestor|clique/);
  });

  it('antes da primeira reconciliação, as contagens ficam sem número, nunca 0', () => {
    const metrics = inconsistencyMetrics(
      {
        open: { total: 0, byType: {} },
        reconciliation: { state: 'PENDING_FIRST' }
      },
      9
    );

    expect(metrics.map(({ count, text }) => [count, text])).toEqual([
      [null, ''],
      [null, ''],
      [null, '']
    ]);
  });

  it('valida a justificativa de dispensa com os mesmos limites do servidor', () => {
    const message = 'A justificativa deve ter entre 10 e 500 caracteres.';
    expect(validateDismissReason('   123456789   ')).toBe(message);
    expect(validateDismissReason('1234567890')).toBe('');
    expect(validateDismissReason('a'.repeat(500))).toBe('');
    expect(validateDismissReason('a'.repeat(501))).toBe(message);
    expect(validateDismissReason(undefined)).toBe(message);
  });

  it('descreve o histórico de um sujeito com quem, quando e por quê (TF-REV-008)', () => {
    const detectedAt = '2026-10-01T10:00:00.000Z';
    const at = '2026-10-03T12:00:00.000Z';
    const dismissed = {
      status: 'DISMISSED',
      detectedAt,
      dismissal: { at, reason: 'Sem código.', by: { id: 3, name: 'Carla Dias' } }
    };
    expect(alertHistoryTitle(dismissed)).toBe(`Dispensada por Carla Dias em ${formatInstant(at)}`);
    expect(
      alertHistoryTitle({ ...dismissed, dismissal: { ...dismissed.dismissal, by: null } })
    ).toBe(`Dispensada por pessoa removida em ${formatInstant(at)}`);
    expect(alertHistoryDetail(dismissed)).toBe(
      `Detectada em ${formatInstant(detectedAt)}. Justificativa: “Sem código.”`
    );
    const resolved = {
      status: 'RESOLVED',
      detectedAt,
      resolvedAt: at,
      resolutionReason: 'TASK_REOPENED'
    };
    expect(alertHistoryTitle(resolved)).toBe(`Resolvida em ${formatInstant(at)} · Tarefa reaberta`);
    expect(alertHistoryDetail(resolved)).toBe(`Detectada em ${formatInstant(detectedAt)}.`);
    expect(historyToggleLabel(1204)).toBe('Histórico (1.204)');
    expect(alertSubjectFilter({ subject: { type: 'TASK', id: 31 } })).toEqual({ taskId: 31 });
    expect(alertSubjectFilter({ subject: { type: 'PULL_REQUEST', id: 70 } })).toEqual({
      pullRequestId: 70
    });
    expect(alertSubjectFilter({ subject: { type: 'ISSUE', id: null } })).toBeNull();
    expect(alertSubjectFilter(null)).toBeNull();
  });
});
