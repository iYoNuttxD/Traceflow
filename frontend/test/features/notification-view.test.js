import { describe, expect, it } from 'vitest';
import {
  POLL_INTERVAL_MS,
  PREFERENCE_GROUPS,
  PREFERENCE_OPTIONS,
  formatDueDate,
  formatInstant,
  NOTIFICATION_GROUPS,
  githubLinkLabel,
  notificationCardLabel,
  notificationContextText,
  notificationEmptyTitle,
  notificationTypeLabel,
  readToggleLabel,
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

  it('diz "Você" quando o responsável fez a própria mudança (TF-REV-002)', () => {
    expect(
      notificationContextText(
        statusChange({
          context: {
            fromStatus: 'A_FAZER',
            toStatus: 'CONCLUIDO',
            actor: { id: 5, name: 'Bruna' },
            selfAction: true
          }
        })
      )
    ).toBe('Você moveu de A fazer para Concluído');
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
      `Issue #45 reaberta no GitHub; última atualização em ${when}`
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

  it('rotula os tipos, o link externo e os três grupos de preferências (TF-REV-008)', () => {
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
      'Avisos do GitHub',
      'Avisos de inconsistência do projeto'
    ]);
    expect(PREFERENCE_OPTIONS.map((option) => [option.type, option.group])).toEqual([
      ['TASK_STATUS_CHANGED', 'TASKS'],
      ['TASK_OVERDUE', 'TASKS'],
      ['ISSUE_EVENT', 'GITHUB'],
      ['PULL_REQUEST_EVENT', 'GITHUB'],
      ['TRACEABILITY_INCONSISTENCY', 'INCONSISTENCIES']
    ]);
  });
});

describe('S2-03 correções — nomes, reabertura e origem (S203-A04, S203-A07, S203-A08)', () => {
  const task = { id: 100, code: 'TASK-100', title: 'Tarefa da bateria' };
  const issue = (id, eventName, occurredAt, number = 45) => ({
    id,
    type: 'ISSUE_EVENT',
    readAt: null,
    task,
    context: {
      event: eventName,
      occurredAt,
      artifact: {
        kind: 'ISSUE',
        number,
        title: 'Corrigir login',
        url: 'https://github.com/o/r/issues/45'
      }
    }
  });
  const movement = (id, fromStatus, toStatus) => ({
    id,
    type: 'TASK_STATUS_CHANGED',
    readAt: null,
    task,
    context: { fromStatus, toStatus, actor: { id: 3, name: 'Ana Souza' } }
  });
  const CLOSED = '2026-10-12T13:03:00.000Z';

  it('C9-01 o nome do cartão e o do botão de leitura levam o contexto e distinguem avisos da mesma tarefa', () => {
    const notifications = [
      issue(1, 'ISSUE_CLOSED', CLOSED),
      issue(2, 'ISSUE_REOPENED', '2026-10-12T15:00:00.000Z'),
      issue(3, 'ISSUE_CLOSED', '2026-10-12T16:00:00.000Z'),
      issue(4, 'ISSUE_CLOSED', CLOSED, 46),
      movement(5, 'A_FAZER', 'EM_ANDAMENTO'),
      movement(6, 'EM_ANDAMENTO', 'CONCLUIDO')
    ];

    const cards = notifications.map(notificationCardLabel);
    const buttons = notifications.map(readToggleLabel);

    expect(new Set(cards).size, JSON.stringify(cards)).toBe(notifications.length);
    expect(new Set(buttons).size, JSON.stringify(buttons)).toBe(notifications.length);
    expect(cards[0]).toBe(
      `Issue: TASK-100 Tarefa da bateria. Issue #45 fechada no GitHub em ${formatInstant(CLOSED)}`
    );
    expect(buttons[0]).toBe(
      `Marcar como lida: Issue #45 fechada no GitHub em ${formatInstant(CLOSED)}, TASK-100`
    );
    expect(cards[4]).toBe(
      'Mudança de status: TASK-100 Tarefa da bateria. Ana Souza moveu de A fazer para Em andamento'
    );
    expect(readToggleLabel({ ...notifications[0], readAt: CLOSED })).toBe(
      `Marcar como não lida: Issue #45 fechada no GitHub em ${formatInstant(CLOSED)}, TASK-100`
    );
  });

  it('C9-01 sem contexto conhecido, o nome volta à tarefa', () => {
    const unknown = {
      id: 7,
      type: 'OUTRO',
      readAt: null,
      task: { id: 7, code: null, title: 'Tarefa sem código' },
      context: {}
    };

    expect(notificationCardLabel(unknown)).toBe('Notificação: Tarefa sem código');
    expect(readToggleLabel(unknown)).toBe('Marcar como lida: Tarefa sem código');
  });

  it('C9-02 a reabertura diz que a data é a da última atualização; sem data, só o evento', () => {
    const updated = '2026-10-19T10:00:00.000Z';

    expect(notificationContextText(issue(1, 'ISSUE_REOPENED', updated))).toBe(
      `Issue #45 reaberta no GitHub; última atualização em ${formatInstant(updated)}`
    );
    expect(notificationContextText(issue(1, 'ISSUE_REOPENED', null))).toBe(
      'Issue #45 reaberta no GitHub'
    );
  });

  it('C9-03 as origens e o estado vazio de cada uma, com as inconsistências (TF-REV-008)', () => {
    expect(NOTIFICATION_GROUPS.map((group) => [group.value, group.label])).toEqual([
      ['ALL', 'Todas as origens'],
      ['TASKS', 'Tarefas'],
      ['GITHUB', 'GitHub'],
      ['INCONSISTENCIES', 'Inconsistências']
    ]);
    expect(
      [
        ['UNREAD', 'ALL'],
        ['ALL', 'ALL'],
        ['UNREAD', 'TASKS'],
        ['ALL', 'TASKS'],
        ['UNREAD', 'GITHUB'],
        ['ALL', 'GITHUB'],
        ['UNREAD', 'INCONSISTENCIES'],
        ['ALL', 'INCONSISTENCIES']
      ].map(([status, group]) => notificationEmptyTitle(status, group))
    ).toEqual([
      'Nenhuma notificação não lida.',
      'Nenhuma notificação recebida.',
      'Nenhuma notificação de tarefas não lida.',
      'Nenhuma notificação de tarefas recebida.',
      'Nenhuma notificação do GitHub não lida.',
      'Nenhuma notificação do GitHub recebida.',
      'Nenhuma notificação de inconsistência não lida.',
      'Nenhuma notificação de inconsistência recebida.'
    ]);
  });
});
