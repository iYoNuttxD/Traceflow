// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_GROUPS,
  POLL_INTERVAL_MS,
  PREFERENCE_GROUPS,
  PREFERENCE_OPTIONS,
  formatDueDate,
  formatInstant,
  loadMoreLabel,
  notificationCardLabel,
  notificationEmptyTitle,
  notificationIconName,
  notificationSentence,
  notificationState,
  notificationTone,
  notificationTypeLabel,
  readToggleLabel,
  unreadBadge,
  unreadNavLabel
} from '../../src/features/notifications/model/notification-view.js';

const task = { id: 12, code: 'TASK-12', title: 'Ajustar login', available: true };
const statusChange = (context = {}, overrides = {}) => ({
  type: 'TASK_STATUS_CHANGED',
  task,
  context: {
    fromStatus: 'EM_ANDAMENTO',
    toStatus: 'CONCLUIDO',
    actor: { id: 3, name: 'Ana Souza' },
    ...context
  },
  ...overrides
});

describe('S2-02 modelo de exibição das notificações (frase compacta do painel, TF-REV-008)', () => {
  it('descreve a mudança de status com ator, tarefa e coluna de destino', () => {
    expect(notificationSentence(statusChange())).toBe('Ana Souza moveu TASK-12 para Concluído');
    expect(notificationSentence(statusChange({ toStatus: 'EM_ANDAMENTO', actor: null }))).toBe(
      'Pessoa removida moveu TASK-12 para Em andamento'
    );
    expect(
      notificationSentence(
        statusChange(
          {},
          { task: { id: null, code: null, title: 'Tarefa removida', available: false } }
        )
      )
    ).toBe('Ana Souza moveu “Tarefa removida” para Concluído');
  });

  it('diz "Você" quando o responsável fez a própria mudança (TF-REV-002)', () => {
    expect(
      notificationSentence(
        statusChange({ toStatus: 'A_FAZER', actor: { id: 5, name: 'Bruna' }, selfAction: true })
      )
    ).toBe('Você moveu TASK-12 para A fazer');
  });

  it('descreve o vencimento com a data do prazo sem deslocar o dia pelo fuso', () => {
    expect(
      notificationSentence({ type: 'TASK_OVERDUE', task, context: { dueDate: '2026-10-10' } })
    ).toBe('TASK-12 venceu em 10/10/2026');
    expect(formatDueDate('2026-01-01')).toBe('01/01/2026');
    expect(formatDueDate(null)).toBe('');
  });

  it('rotula os tipos, os tons semânticos e os estados vazios', () => {
    expect(notificationTypeLabel('TASK_STATUS_CHANGED')).toBe('Mudança de status');
    expect(notificationTypeLabel('TASK_OVERDUE')).toBe('Prazo vencido');
    expect(notificationTypeLabel('TRACEABILITY_INCONSISTENCY')).toBe('Inconsistência');
    expect(
      [
        'TASK_STATUS_CHANGED',
        'TASK_OVERDUE',
        'ISSUE_EVENT',
        'PULL_REQUEST_EVENT',
        'TRACEABILITY_INCONSISTENCY'
      ].map((type) => [notificationTone({ type }), notificationIconName({ type })])
    ).toEqual([
      ['info', 'status'],
      ['danger', 'clock'],
      ['info', 'issue'],
      ['info', 'merge'],
      ['warning', 'alert']
    ]);
    expect(notificationEmptyTitle('UNREAD')).toBe('Nenhuma notificação não lida.');
    expect(notificationEmptyTitle('ALL')).toBe('Nenhuma notificação recebida.');
  });

  it('mostra o contador só acima de zero, limita em 99+ e consulta a cada 60 segundos', () => {
    expect(unreadBadge(0)).toBeNull();
    expect(unreadBadge(undefined)).toBeNull();
    expect(unreadBadge(7)).toBe('7');
    expect(unreadBadge(99)).toBe('99');
    expect(unreadBadge(100)).toBe('99+');
    expect(unreadNavLabel(0)).toBe('Notificações');
    expect(unreadNavLabel(1)).toBe('Notificações, 1 não lida');
    expect(unreadNavLabel(250)).toBe('Notificações, 250 não lidas');
    expect(POLL_INTERVAL_MS).toBe(60_000);
    expect(loadMoreLabel(25)).toBe('Carregar mais (25 restantes)');
    expect(loadMoreLabel(1)).toBe('Carregar mais (1 restante)');
    expect(loadMoreLabel(1204)).toBe('Carregar mais (1.204 restantes)');
    expect(loadMoreLabel(0)).toBe('Carregar mais');
  });
});

describe('S2-03 modelo de exibição dos eventos do GitHub (frase compacta do painel)', () => {
  const event = (type, eventName, number) => ({
    type,
    task,
    context: {
      event: eventName,
      occurredAt: '2026-10-12T13:03:00.000Z',
      artifact: {
        kind: type === 'ISSUE_EVENT' ? 'ISSUE' : 'PULL_REQUEST',
        number,
        title: 'Título',
        url: 'https://github.com/o/r/issues/1'
      }
    }
  });

  it('descreve os cinco eventos com o artefato e a tarefa', () => {
    expect(notificationSentence(event('ISSUE_EVENT', 'ISSUE_LINKED', 45))).toBe(
      'Issue #45, aberta no GitHub, vinculada à TASK-12'
    );
    expect(notificationSentence(event('ISSUE_EVENT', 'ISSUE_CLOSED', 45))).toBe(
      'Issue #45 fechada no GitHub · TASK-12'
    );
    expect(notificationSentence(event('ISSUE_EVENT', 'ISSUE_REOPENED', 45))).toBe(
      'Issue #45 reaberta no GitHub · TASK-12'
    );
    expect(notificationSentence(event('PULL_REQUEST_EVENT', 'PULL_REQUEST_MERGED', 8))).toBe(
      'PR #8 mesclada no GitHub · TASK-12'
    );
    expect(notificationSentence(event('PULL_REQUEST_EVENT', 'PULL_REQUEST_CLOSED', 8))).toBe(
      'PR #8 fechada sem merge no GitHub · TASK-12'
    );
  });

  it('a associação diz que a issue aberta foi vinculada, sem dar a abertura como o fato (TF-REV-002)', () => {
    const linked = (taskValue) => ({
      ...event('ISSUE_EVENT', 'ISSUE_LINKED', 45),
      task: taskValue
    });

    expect(notificationSentence(linked({ title: 'Ajustar login' }))).toBe(
      'Issue #45, aberta no GitHub, vinculada à tarefa “Ajustar login”'
    );
    expect(notificationSentence(linked(null))).toBe(
      'Issue #45, aberta no GitHub, vinculada a uma tarefa removida'
    );
    expect(notificationCardLabel({ ...linked(task), project: { name: 'Portal' } })).toMatch(
      /^Issue: Issue #45, aberta no GitHub, vinculada à TASK-12\. Portal, /
    );
  });

  it('evento desconhecido usa texto genérico, inclusive com chave de protótipo', () => {
    expect(notificationSentence(event('ISSUE_EVENT', 'OUTRO', 45))).toBe(
      'Issue #45 mudou no GitHub · TASK-12'
    );
    expect(notificationSentence(event('ISSUE_EVENT', '__proto__', 45))).toBe(
      'Issue #45 mudou no GitHub · TASK-12'
    );
  });

  it('rotula os tipos e os três grupos de preferências (TF-REV-008)', () => {
    expect(notificationTypeLabel('ISSUE_EVENT')).toBe('Issue');
    expect(notificationTypeLabel('PULL_REQUEST_EVENT')).toBe('Pull request');
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

describe('S2-03 correções — nomes e origem no painel (S203-A04, S203-A08, TF-REV-008)', () => {
  const project = { id: 9, name: 'Projeto Alfa' };
  const issue = (id, eventName, createdAt, number = 45) => ({
    id,
    type: 'ISSUE_EVENT',
    readAt: null,
    createdAt,
    project,
    task,
    context: {
      event: eventName,
      occurredAt: createdAt,
      artifact: { kind: 'ISSUE', number, title: 'Corrigir login', url: null }
    }
  });
  const movement = (id, toStatus, createdAt) => ({
    id,
    type: 'TASK_STATUS_CHANGED',
    readAt: null,
    createdAt,
    project,
    task,
    context: { fromStatus: 'A_FAZER', toStatus, actor: { id: 3, name: 'Ana Souza' } }
  });

  it('C9-01 o nome do item e o do botão de leitura distinguem avisos da mesma tarefa', () => {
    const notifications = [
      issue(1, 'ISSUE_CLOSED', '2026-10-12T13:03:00.000Z'),
      issue(2, 'ISSUE_REOPENED', '2026-10-12T15:00:00.000Z'),
      issue(3, 'ISSUE_CLOSED', '2026-10-12T16:00:00.000Z'),
      issue(4, 'ISSUE_CLOSED', '2026-10-12T13:03:00.000Z', 46),
      movement(5, 'EM_ANDAMENTO', '2026-10-12T17:00:00.000Z'),
      movement(6, 'EM_ANDAMENTO', '2026-10-12T18:00:00.000Z')
    ];

    const items = notifications.map(notificationCardLabel);
    const buttons = notifications.map(readToggleLabel);

    expect(new Set(items).size, JSON.stringify(items)).toBe(notifications.length);
    expect(new Set(buttons).size, JSON.stringify(buttons)).toBe(notifications.length);
    expect(items[0]).toBe(
      `Issue: Issue #45 fechada no GitHub · TASK-12. Projeto Alfa, ${formatInstant('2026-10-12T13:03:00.000Z')}`
    );
    expect(buttons[0]).toBe(
      `Marcar como lida: Issue #45 fechada no GitHub · TASK-12, Projeto Alfa, ${formatInstant('2026-10-12T13:03:00.000Z')}`
    );
    expect(readToggleLabel({ ...notifications[0], readAt: '2026-10-12T19:00:00.000Z' })).toMatch(
      /^Marcar como não lida: Issue #45 fechada no GitHub/
    );
  });

  it('C9-01 tipo desconhecido usa a frase genérica com a tarefa', () => {
    expect(notificationSentence({ type: 'OUTRO', task, context: {} })).toBe(
      'Notificação sobre TASK-12'
    );
    expect(notificationTypeLabel('OUTRO')).toBe('Notificação');
  });

  it('C9-03 as origens e o estado vazio de cada uma, com as inconsistências', () => {
    expect(NOTIFICATION_GROUPS.map((group) => [group.value, group.label])).toEqual([
      ['ALL', 'Todas'],
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

describe('PR #26 avisos de inconsistência no painel (TF-REV-008)', () => {
  const notice = (context) => ({ type: 'TRACEABILITY_INCONSISTENCY', task: null, context });
  const artifact = (kind, number) => ({ kind, number, title: 'Título', url: null });

  it('descreve a PR e a issue sem tarefa e o resumo do lote', () => {
    expect(
      notificationSentence(notice({ artifact: artifact('PULL_REQUEST', 8), alert: null }))
    ).toBe('PR #8 mesclada sem tarefa vinculada');
    expect(notificationSentence(notice({ artifact: artifact('ISSUE', 45), alert: null }))).toBe(
      'Issue #45 fechada sem tarefa vinculada'
    );
    expect(
      notificationSentence(
        notice({ artifact: null, batch: { total: 12, pullRequests: 9, issues: 3 } })
      )
    ).toBe('12 inconsistências novas: 9 PRs mescladas e 3 issues fechadas sem tarefa');
    expect(
      notificationSentence(
        notice({ artifact: null, batch: { total: 11, pullRequests: 11, issues: 0 } })
      )
    ).toBe('11 inconsistências novas: 11 PRs mescladas sem tarefa');
  });

  it('mostra o estado atual do alerta; o resumo e os outros tipos não têm estado', () => {
    const resolvedAt = '2026-10-16T15:00:00.000Z';
    expect(notificationState(notice({ alert: { status: 'OPEN' } }))).toBe('em aberto');
    expect(notificationState(notice({ alert: { status: 'RESOLVED', resolvedAt } }))).toBe(
      `resolvida em ${new Date(resolvedAt).toLocaleDateString('pt-BR')}`
    );
    expect(
      notificationState(notice({ alert: { status: 'DISMISSED', dismissedAt: resolvedAt } }))
    ).toMatch(/^dispensada em /);
    expect(notificationState(notice({ alert: null, batch: { total: 12 } }))).toBe('');
    expect(notificationState(statusChange())).toBe('');
  });
});
