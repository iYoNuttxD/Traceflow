import { describe, expect, it } from 'vitest';
import {
  POLL_INTERVAL_MS,
  PREFERENCE_GROUPS,
  PREFERENCE_OPTIONS,
  formatDueDate,
  formatInstant,
  githubLinkLabel,
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

describe('S2-03 modelo de exibição dos eventos do GitHub', () => {
  const event = (type, eventName, number, overrides = {}) => ({
    type,
    context: {
      event: eventName,
      occurredAt: '2026-10-12T13:03:00.000Z',
      artifact: {
        kind: type === 'ISSUE_EVENT' ? 'ISSUE' : 'PULL_REQUEST',
        number,
        title: 'Título',
        url: 'https://github.com/o/r/issues/1'
      },
      ...overrides
    }
  });
  const when = formatInstant('2026-10-12T13:03:00.000Z');

  it('descreve os quatro eventos com número e data da ocorrência', () => {
    expect(notificationContextText(event('ISSUE_EVENT', 'ISSUE_CLOSED', 45))).toBe(
      `Issue #45 fechada no GitHub em ${when}`
    );
    expect(notificationContextText(event('ISSUE_EVENT', 'ISSUE_REOPENED', 45))).toBe(
      `Issue #45 reaberta no GitHub em ${when}`
    );
    expect(notificationContextText(event('PULL_REQUEST_EVENT', 'PULL_REQUEST_MERGED', 8))).toBe(
      `Pull request #8 mesclada no GitHub em ${when}`
    );
    expect(notificationContextText(event('PULL_REQUEST_EVENT', 'PULL_REQUEST_CLOSED', 8))).toBe(
      `Pull request #8 fechada sem merge no GitHub em ${when}`
    );
  });

  it('sem data omite o instante; evento desconhecido usa texto genérico', () => {
    expect(
      notificationContextText(event('ISSUE_EVENT', 'ISSUE_CLOSED', 45, { occurredAt: null }))
    ).toBe('Issue #45 fechada no GitHub');
    expect(notificationContextText(event('ISSUE_EVENT', 'OUTRO', 45))).toBe(
      `Issue #45 mudou no GitHub em ${when}`
    );
    expect(notificationContextText(event('ISSUE_EVENT', '__proto__', 45))).toBe(
      `Issue #45 mudou no GitHub em ${when}`
    );
  });

  it('rotula os tipos, o link externo e os dois grupos de preferências', () => {
    expect(notificationTypeLabel('ISSUE_EVENT')).toBe('Issue');
    expect(notificationTypeLabel('PULL_REQUEST_EVENT')).toBe('Pull request');
    expect(githubLinkLabel(event('ISSUE_EVENT', 'ISSUE_CLOSED', 45))).toBe(
      'Abrir no GitHub a issue #45 (abre em nova aba)'
    );
    expect(githubLinkLabel(event('PULL_REQUEST_EVENT', 'PULL_REQUEST_MERGED', 8))).toBe(
      'Abrir no GitHub a pull request #8 (abre em nova aba)'
    );
    expect(PREFERENCE_GROUPS.map((group) => group.legend)).toEqual([
      'Avisos sobre as suas tarefas',
      'Avisos do GitHub'
    ]);
    expect(PREFERENCE_OPTIONS.map((option) => [option.type, option.group])).toEqual([
      ['TASK_STATUS_CHANGED', 'TASKS'],
      ['TASK_OVERDUE', 'TASKS'],
      ['ISSUE_EVENT', 'GITHUB'],
      ['PULL_REQUEST_EVENT', 'GITHUB']
    ]);
  });
});
