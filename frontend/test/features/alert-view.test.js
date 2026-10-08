import { describe, expect, it } from 'vitest';
import {
  ALERT_STATUSES,
  ALERT_TYPES,
  RESOLUTION_REASONS,
  activeAlertFilterCount,
  alertEmptyTitle,
  alertFactText,
  alertStatusLabel,
  alertSummarySentence,
  alertTypeLabel,
  emptyAlertFilters,
  formatInstant,
  reconcileMessage,
  resolutionLabel,
  unlinkedCountLabel,
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

  it('resume os alertas abertos em texto com singular e plural', () => {
    expect(alertSummarySentence(null)).toBe('');
    expect(alertSummarySentence({ open: { total: 0, byType: {} } })).toBe('Nenhum alerta aberto.');
    expect(
      alertSummarySentence({
        open: {
          total: 3,
          byType: { TASK_CONCLUDED_WITHOUT_COMMIT: 2, PULL_REQUEST_MERGED_WITHOUT_TASK: 1 }
        }
      })
    ).toBe('3 alertas abertos: 2 tarefas concluídas sem commit, 1 PR mesclada sem tarefa.');
    expect(
      alertSummarySentence({ open: { total: 1, byType: { ISSUE_CLOSED_WITHOUT_TASK: 1 } } })
    ).toBe('1 alerta aberto: 1 issue fechada sem tarefa.');
  });

  it('escreve o resultado do reprocessamento e a contagem do RF58', () => {
    expect(reconcileMessage({ created: 2, resolved: 1, kept: 5 })).toBe(
      'Reprocessamento concluído: 2 novos, 1 resolvido, 5 mantidos.'
    );
    expect(reconcileMessage({ created: 1, resolved: 0, kept: 1 })).toBe(
      'Reprocessamento concluído: 1 novo, 0 resolvidos, 1 mantido.'
    );
    expect(unlinkedCountLabel(1)).toBe('1 tarefa sem vínculo técnico');
    expect(unlinkedCountLabel(12)).toBe('12 tarefas sem vínculo técnico');
    expect(unlinkedCountLabel(undefined)).toBe('');
  });

  it('valida a justificativa de dispensa com os mesmos limites do servidor', () => {
    const message = 'A justificativa deve ter entre 10 e 500 caracteres.';
    expect(validateDismissReason('   123456789   ')).toBe(message);
    expect(validateDismissReason('1234567890')).toBe('');
    expect(validateDismissReason('a'.repeat(500))).toBe('');
    expect(validateDismissReason('a'.repeat(501))).toBe(message);
    expect(validateDismissReason(undefined)).toBe(message);
  });

  it('conta filtros ativos e escolhe o título do estado vazio', () => {
    expect(activeAlertFilterCount(emptyAlertFilters)).toBe(0);
    expect(activeAlertFilterCount({ status: 'RESOLVED', type: 'ISSUE_CLOSED_WITHOUT_TASK' })).toBe(
      2
    );
    expect(alertEmptyTitle(emptyAlertFilters)).toBe(
      'Nenhuma inconsistência pendente neste projeto.'
    );
    expect(alertEmptyTitle({ status: 'DISMISSED', type: '' })).toBe('Nenhum alerta dispensado.');
    expect(alertEmptyTitle({ status: 'RESOLVED', type: '' })).toBe('Nenhum alerta resolvido.');
    expect(alertEmptyTitle({ status: 'OPEN', type: 'ISSUE_CLOSED_WITHOUT_TASK' })).toBe(
      'Nenhum alerta corresponde aos filtros.'
    );
  });
});
