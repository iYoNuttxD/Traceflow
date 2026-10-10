import { describe, expect, it } from 'vitest';
import {
  POLL_INTERVAL_MS,
  formatDueDate,
  notificationContextText,
  notificationEmptyTitle,
  notificationTypeLabel,
  unreadBadge,
  unreadNavLabel
} from '../../src/features/notifications/model/notification-view.js';

const statusChange = (overrides = {}) => ({
  type: 'TASK_STATUS_CHANGED',
  context: {
    fromStatus: 'EM_ANDAMENTO',
    toStatus: 'CONCLUIDO',
    actor: { id: 3, name: 'Ana Souza' }
  },
  ...overrides
});

describe('S2-02 modelo de exibição das notificações', () => {
  it('descreve a mudança de status com ator e rótulos de coluna', () => {
    expect(notificationContextText(statusChange())).toBe(
      'Ana Souza moveu de Em andamento para Concluído'
    );
    expect(
      notificationContextText(
        statusChange({ context: { fromStatus: 'A_FAZER', toStatus: 'EM_ANDAMENTO', actor: null } })
      )
    ).toBe('Pessoa removida moveu de A fazer para Em andamento');
  });

  it('descreve o vencimento com a data do prazo sem deslocar o dia pelo fuso', () => {
    expect(
      notificationContextText({ type: 'TASK_OVERDUE', context: { dueDate: '2026-10-10' } })
    ).toBe('Prazo venceu em 10/10/2026');
    expect(formatDueDate('2026-01-01')).toBe('01/01/2026');
    expect(formatDueDate(null)).toBe('');
  });

  it('rotula os tipos e os estados vazios', () => {
    expect(notificationTypeLabel('TASK_STATUS_CHANGED')).toBe('Mudança de status');
    expect(notificationTypeLabel('TASK_OVERDUE')).toBe('Prazo vencido');
    expect(notificationEmptyTitle('UNREAD')).toBe('Nenhuma notificação não lida.');
    expect(notificationEmptyTitle('ALL')).toBe('Nenhuma notificação recebida.');
  });

  it('mostra o contador só acima de zero e limita em 99+', () => {
    expect(unreadBadge(0)).toBeNull();
    expect(unreadBadge(undefined)).toBeNull();
    expect(unreadBadge(7)).toBe('7');
    expect(unreadBadge(99)).toBe('99');
    expect(unreadBadge(100)).toBe('99+');
    expect(unreadNavLabel(0)).toBe('Notificações');
    expect(unreadNavLabel(1)).toBe('Notificações, 1 não lida');
    expect(unreadNavLabel(250)).toBe('Notificações, 250 não lidas');
  });

  it('consulta o contador a cada 60 segundos', () => {
    expect(POLL_INTERVAL_MS).toBe(60_000);
  });
});
