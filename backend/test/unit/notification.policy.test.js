import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_EXCLUSIONS,
  NOTIFICATION_TYPES,
  dueDateOf,
  isOverdue,
  latestOverdueDueDate,
  localDateOf,
  notificationCoverage,
  notificationLink,
  overdueCutoff,
  overdueDedupeKey,
  overdueExclusion,
  snapshotTitle,
  startOfLocalDay,
  statusChangeDedupeKey,
  statusChangeExclusion
} from '../../src/modules/notifications/notification.policy.js';

const SAO_PAULO = 'America/Sao_Paulo';
const at = (iso) => new Date(iso);

describe('S2-02 política: data do prazo', () => {
  it('usa a data UTC do valor gravado, com ou sem hora', () => {
    expect(dueDateOf(at('2026-10-10T00:00:00.000Z'))).toBe('2026-10-10');
    expect(dueDateOf(at('2026-10-10T23:30:00.000Z'))).toBe('2026-10-10');
    expect(dueDateOf('2026-10-10T02:00:00.000Z')).toBe('2026-10-10');
    expect(dueDateOf(null)).toBeNull();
    expect(dueDateOf(undefined)).toBeNull();
  });
});

describe('S2-02 política: corte do vencimento (C5)', () => {
  it('vence no início do dia seguinte em America/Sao_Paulo, em valor-limite', () => {
    expect(overdueCutoff('2026-10-10', SAO_PAULO).toISOString()).toBe('2026-10-11T03:00:00.000Z');
    const task = { status: 'EM_ANDAMENTO', dueDate: '2026-10-10' };
    expect(isOverdue(task, at('2026-10-11T03:00:00.000Z'), SAO_PAULO)).toBe(true);
    expect(isOverdue(task, at('2026-10-11T02:59:59.999Z'), SAO_PAULO)).toBe(false);
  });

  it('move o corte conforme APP_TIMEZONE', () => {
    expect(overdueCutoff('2026-10-10', 'UTC').toISOString()).toBe('2026-10-11T00:00:00.000Z');
    expect(overdueCutoff('2026-10-10', 'Asia/Tokyo').toISOString()).toBe(
      '2026-10-10T15:00:00.000Z'
    );
    const task = { status: 'A_FAZER', dueDate: '2026-10-10' };
    expect(isOverdue(task, at('2026-10-10T15:00:00.000Z'), 'Asia/Tokyo')).toBe(true);
    expect(isOverdue(task, at('2026-10-10T14:59:59.999Z'), 'Asia/Tokyo')).toBe(false);
    expect(isOverdue(task, at('2026-10-11T00:00:00.000Z'), 'UTC')).toBe(true);
    expect(isOverdue(task, at('2026-10-10T23:59:59.999Z'), 'UTC')).toBe(false);
  });

  it('não supõe ausência de horário de verão: meia-noite inexistente vira o primeiro instante do dia', () => {
    expect(startOfLocalDay('2018-11-04', SAO_PAULO).toISOString()).toBe('2018-11-04T03:00:00.000Z');
    expect(overdueCutoff('2018-11-03', SAO_PAULO).toISOString()).toBe('2018-11-04T03:00:00.000Z');
    expect(startOfLocalDay('2019-02-17', SAO_PAULO).toISOString()).toBe('2019-02-17T03:00:00.000Z');
    expect(startOfLocalDay('2026-03-29', 'Europe/Lisbon').toISOString()).toBe(
      '2026-03-29T00:00:00.000Z'
    );
    expect(startOfLocalDay('2026-10-25', 'Europe/Lisbon').toISOString()).toBe(
      '2026-10-24T23:00:00.000Z'
    );
  });

  it('tarefa concluída ou sem prazo não vence', () => {
    const now = at('2026-12-31T12:00:00.000Z');
    expect(isOverdue({ status: 'CONCLUIDO', dueDate: '2026-10-10' }, now, SAO_PAULO)).toBe(false);
    expect(isOverdue({ status: 'A_FAZER', dueDate: null }, now, SAO_PAULO)).toBe(false);
  });

  it('calcula a data local de um instante no fuso de referência', () => {
    expect(localDateOf(at('2026-10-11T02:59:59.999Z'), SAO_PAULO)).toBe('2026-10-10');
    expect(localDateOf(at('2026-10-11T03:00:00.000Z'), SAO_PAULO)).toBe('2026-10-11');
    expect(localDateOf(at('2026-10-10T15:00:00.000Z'), 'Asia/Tokyo')).toBe('2026-10-11');
  });
});

describe('S2-02 política: sem janela de recuperação (TF-REV-002)', () => {
  const now = at('2026-10-20T12:00:00.000Z');

  it('a data de prazo mais recente já vencida é o limite, sem limite inferior', () => {
    expect(latestOverdueDueDate(now, SAO_PAULO)).toBe('2026-10-19');
    expect(latestOverdueDueDate(at('2026-10-11T03:00:00.000Z'), SAO_PAULO)).toBe('2026-10-10');
    expect(latestOverdueDueDate(at('2026-10-11T02:59:59.999Z'), SAO_PAULO)).toBe('2026-10-09');
  });

  it('tarefa vencida há meses continua vencida', () => {
    expect(isOverdue({ status: 'A_FAZER', dueDate: '2025-03-01' }, now, SAO_PAULO)).toBe(true);
    expect(isOverdue({ status: 'A_FAZER', dueDate: '2026-10-12' }, now, SAO_PAULO)).toBe(true);
    expect(isOverdue({ status: 'A_FAZER', dueDate: '2026-10-20' }, now, SAO_PAULO)).toBe(false);
  });
});

describe('S2-02 política: chaves de deduplicação', () => {
  it('identifica o movimento e o par tarefa-prazo', () => {
    expect(statusChangeDedupeKey(42)).toBe('TASK_STATUS_CHANGED:movement:42');
    expect(overdueDedupeKey(7, '2026-10-10')).toBe('TASK_OVERDUE:7:2026-10-10');
    expect(overdueDedupeKey(7, '2026-10-10')).not.toBe(overdueDedupeKey(7, '2026-10-11'));
    expect(statusChangeDedupeKey(2147483647).length).toBeLessThanOrEqual(96);
    expect(overdueDedupeKey(2147483647, '2026-10-10').length).toBeLessThanOrEqual(96);
  });
});

describe('S2-02 política: elegibilidade (D3, D7)', () => {
  const eligible = {
    responsibleUserId: 5,
    actorUserId: 9,
    accountActive: true,
    membershipActive: true,
    preferenceEnabled: true
  };

  it('mudança de status: aplica as exclusões na ordem documentada, sem excluir o próprio ator (TF-REV-002)', () => {
    expect(statusChangeExclusion(eligible)).toBeNull();
    expect(statusChangeExclusion({ ...eligible, responsibleUserId: null })).toBe('NO_RESPONSIBLE');
    expect(statusChangeExclusion({ ...eligible, actorUserId: 5 })).toBeNull();
    expect(statusChangeExclusion({ ...eligible, accountActive: false })).toBe('INACTIVE_ACCOUNT');
    expect(statusChangeExclusion({ ...eligible, membershipActive: false })).toBe('INACTIVE_MEMBER');
    expect(statusChangeExclusion({ ...eligible, preferenceEnabled: false })).toBe('PREFERENCE_OFF');
    expect(
      statusChangeExclusion({
        responsibleUserId: 5,
        actorUserId: 5,
        accountActive: false,
        membershipActive: false,
        preferenceEnabled: false
      })
    ).toBe('INACTIVE_ACCOUNT');
  });

  it('vencimento: o destinatário vem primeiro, sem janela (TF-REV-002)', () => {
    const base = { ...eligible };
    expect(overdueExclusion(base)).toBeNull();
    expect(overdueExclusion({ ...base, responsibleUserId: null })).toBe('NO_RESPONSIBLE');
    expect(overdueExclusion({ ...base, accountActive: false })).toBe('INACTIVE_ACCOUNT');
    expect(overdueExclusion({ ...base, membershipActive: false })).toBe('INACTIVE_MEMBER');
    expect(overdueExclusion({ ...base, preferenceEnabled: false })).toBe('PREFERENCE_OFF');
    expect(overdueExclusion({ ...base, actorUserId: 5 })).toBeNull();
  });

  it('expõe os tipos e os motivos documentados', () => {
    expect(NOTIFICATION_TYPES).toEqual([
      'TASK_STATUS_CHANGED',
      'TASK_OVERDUE',
      'ISSUE_EVENT',
      'PULL_REQUEST_EVENT'
    ]);
    expect(NOTIFICATION_EXCLUSIONS).toEqual([
      'NO_RESPONSIBLE',
      'INACTIVE_ACCOUNT',
      'INACTIVE_MEMBER',
      'PREFERENCE_OFF'
    ]);
  });
});

describe('S2-02 política: contexto e métrica', () => {
  it('monta o link do Kanban só com tarefa existente', () => {
    expect(notificationLink(3, 17)).toBe('/projects/3/kanban?task=17');
    expect(notificationLink(3, null)).toBeNull();
  });

  it('copia o título no limite da coluna, em code points', () => {
    expect(snapshotTitle('a'.repeat(191))).toHaveLength(191);
    expect(Array.from(snapshotTitle('😀'.repeat(200)))).toHaveLength(191);
    expect(snapshotTitle('  Título  ')).toBe('  Título  ');
  });

  it('calcula a cobertura sobre os eventos elegíveis', () => {
    expect(notificationCoverage({ delivered: 5, eligible: 5 })).toBe(100);
    expect(notificationCoverage({ delivered: 4, eligible: 5 })).toBe(80);
    expect(notificationCoverage({ delivered: 0, eligible: 0 })).toBeNull();
  });
});
