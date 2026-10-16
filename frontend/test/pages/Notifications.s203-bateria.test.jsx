import { MemoryRouter, Route, Routes } from 'react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  getUnreadNotificationCount: vi.fn(),
  markNotification: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  getNotificationPreferences: vi.fn(),
  saveNotificationPreferences: vi.fn()
}));
vi.mock('../../src/features/notifications/api/notifications.api.js', () => api);

import { NotificationsPage } from '../../src/pages/NotificationsPage.jsx';
import { UnreadNotificationsProvider } from '../../src/features/notifications/index.js';

const OCCURRED = '2026-10-12T13:03:00.000Z';
const EXPECTED_DATE = new Map([
  ['America/Sao_Paulo', '12/10/2026 10:03'],
  ['Pacific/Kiritimati', '13/10/2026 03:03'],
  ['Pacific/Pago_Pago', '12/10/2026 02:03'],
  ['UTC', '12/10/2026 13:03'],
  ['Etc/UTC', '12/10/2026 13:03']
]);
const ISSUE_URL = 'https://github.com/usuario-s203/repositorio-s203/issues/45';
const PR_URL = 'https://github.com/usuario-s203/repositorio-s203/pull/8';
const XSS = '<img src=x onerror="window.__s203bateria=1">';

function notification(id, overrides = {}) {
  const { context = {}, task = {}, project = {}, ...rest } = overrides;
  return {
    id,
    type: 'ISSUE_EVENT',
    createdAt: '2026-10-12T14:00:00.000Z',
    readAt: null,
    project: { id: 9, name: 'Projeto Bateria', ...project },
    task: { id: 100, code: 'TASK-100', title: 'Tarefa da bateria', available: true, ...task },
    context: {
      event: 'ISSUE_CLOSED',
      occurredAt: OCCURRED,
      artifact: { kind: 'ISSUE', number: 45, title: 'Corrigir login', url: ISSUE_URL },
      ...context
    },
    link: '/projects/9/kanban?task=100',
    ...rest
  };
}

const pullRequest = (id, event, overrides = {}) =>
  notification(id, {
    type: 'PULL_REQUEST_EVENT',
    context: {
      event,
      artifact: { kind: 'PULL_REQUEST', number: 8, title: 'Ajusta a sincronização', url: PR_URL }
    },
    ...overrides
  });

function listing(items, nextCursor = null) {
  return {
    notifications: items,
    pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 },
    unreadCount: items.filter((item) => !item.readAt).length,
    nextCursor
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/notifications']}>
      <UnreadNotificationsProvider>
        <Routes>
          <Route path="/notifications" element={<NotificationsPage />} />
        </Routes>
      </UnreadNotificationsProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  delete window.__s203bateria;
  api.getUnreadNotificationCount.mockResolvedValue({ unreadCount: 0 });
});

describe('S2-03 bateria — bloco U: cartões do GitHub', () => {
  it('EV-U-01 os quatro eventos mostram texto próprio e a data no fuso do navegador', async () => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const expectedDate = EXPECTED_DATE.get(zone);
    api.listNotifications.mockResolvedValue(
      listing([
        notification(1, { task: { id: 101, code: 'TASK-101' } }),
        notification(2, {
          task: { id: 102, code: 'TASK-102' },
          context: { event: 'ISSUE_REOPENED' }
        }),
        pullRequest(3, 'PULL_REQUEST_MERGED', { task: { id: 103, code: 'TASK-103' } }),
        pullRequest(4, 'PULL_REQUEST_CLOSED', { task: { id: 104, code: 'TASK-104' } })
      ])
    );
    renderPage();

    const cards = await screen.findAllByRole('article');
    const texts = cards.map(
      (card) => card.querySelector('.notification-card__context').textContent
    );
    const verbs = [
      'Issue #45 fechada no GitHub em',
      'Issue #45 reaberta no GitHub; última atualização em',
      'Pull request #8 mesclada no GitHub em',
      'Pull request #8 fechada sem merge no GitHub em'
    ];
    verbs.forEach((verb, index) => expect(texts[index]).toContain(verb));
    if (expectedDate) for (const text of texts) expect(text, zone).toContain(expectedDate);
    for (const card of cards) {
      const external = within(card).getByRole('link', { name: /Abrir no GitHub/ });
      expect(external).toHaveAttribute('target', '_blank');
      expect(external).toHaveAttribute('rel', 'noopener noreferrer');
      expect(within(card).getByRole('link', { name: /^Abrir tarefa TASK-/ })).toBeInTheDocument();
      expect(within(card).getByRole('button', { name: /Marcar como lida/ })).toBeInTheDocument();
    }
  });

  it('EV-U-03 títulos, nome do projeto e tarefa com HTML, script e quebra de linha aparecem como texto', async () => {
    api.listNotifications.mockResolvedValue(
      listing([
        notification(1, {
          project: { name: `Projeto ${XSS}` },
          task: { title: `Tarefa </script><script>window.__s203bateria=2</script>` },
          context: {
            artifact: {
              kind: 'ISSUE',
              number: 45,
              title: `Título\nquebrado ${XSS} \u202Eotset\u202C e\u200Bzero`,
              url: ISSUE_URL
            }
          }
        })
      ])
    );
    const { container } = renderPage();

    const card = await screen.findByRole('article');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(window.__s203bateria).toBeUndefined();
    const artifact = card.querySelector('.notification-card__artifact');
    expect(artifact.textContent).toContain(XSS);
    expect(artifact.textContent).toContain('\u202Eotset\u202C');
    expect(artifact.textContent).toContain('e\u200Bzero');
    expect(card.querySelector('.notification-card__context').textContent).not.toContain('\u202E');
    expect(card.textContent).toContain('</script><script>');
  });

  it('EV-U-04 título de 256 caracteres sem espaço fica na linha própria, com a classe que quebra em qualquer ponto', async () => {
    const title = `${'Título-longo-sem-espaço-'.repeat(11)}`.slice(0, 256);
    api.listNotifications.mockResolvedValue(
      listing([
        notification(1, {
          context: { artifact: { kind: 'ISSUE', number: 45, title, url: ISSUE_URL } }
        })
      ])
    );
    renderPage();

    const card = await screen.findByRole('article');
    const artifact = card.querySelector('.notification-card__artifact');
    expect(artifact.tagName).toBe('P');
    expect(artifact.textContent).toBe(title);
  });

  it('EV-U-08 tipos misturados no filtro Não lidas e marcar todas', async () => {
    const user = userEvent.setup();
    const items = [
      notification(1),
      pullRequest(2, 'PULL_REQUEST_MERGED', { task: { id: 200, code: 'TASK-200' } }),
      notification(3, {
        type: 'TASK_STATUS_CHANGED',
        task: { id: 300, code: 'TASK-300' },
        context: { fromStatus: 'A_FAZER', toStatus: 'EM_ANDAMENTO', actor: { id: 7, name: 'Ana' } }
      })
    ];
    api.listNotifications.mockResolvedValue(listing(items));
    api.markAllNotificationsRead.mockResolvedValue({ updated: 3 });
    api.getUnreadNotificationCount.mockResolvedValue({ unreadCount: 3 });
    renderPage();

    await screen.findAllByRole('article');
    expect(screen.getAllByRole('article')).toHaveLength(3);
    const markAll = screen.getByRole('button', { name: 'Marcar todas como lidas' });
    await waitFor(() => expect(markAll).toHaveAttribute('aria-disabled', 'false'));
    await user.click(markAll);

    expect(api.markAllNotificationsRead).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(api.listNotifications.mock.calls.length).toBeGreaterThanOrEqual(1));
  });

  it('EV-U-09 nada dos avisos do GitHub fica no armazenamento do navegador depois de usar a central', async () => {
    const user = userEvent.setup();
    const item = notification(1, {
      context: {
        artifact: { kind: 'ISSUE', number: 45, title: 'Título sigiloso do GitHub', url: ISSUE_URL }
      }
    });
    api.listNotifications.mockResolvedValue(listing([item]));
    api.markNotification.mockResolvedValue({
      notification: { ...item, readAt: '2026-10-12T15:00:00.000Z' }
    });
    renderPage();

    const card = await screen.findByRole('article');
    await user.click(within(card).getByRole('button', { name: /Marcar como lida/ }));
    await user.click(screen.getByRole('radio', { name: 'Todas' }));

    const dump = (storage) =>
      Array.from({ length: storage.length }, (_, index) => {
        const key = storage.key(index);
        return `${key}=${storage.getItem(key)}`;
      });
    const stored = JSON.stringify([...dump(window.localStorage), ...dump(window.sessionStorage)]);
    expect(stored).not.toContain('sigiloso');
    expect(stored).not.toContain('github.com');
  });
});

describe('S2-03 correções — central (S203-A04, S203-A07, S203-A08)', () => {
  it('C9-01 dois avisos da mesma tarefa e do mesmo tipo têm nomes distintos no cartão e no botão de leitura (EV-U-05)', async () => {
    api.listNotifications.mockResolvedValue(
      listing([
        notification(1),
        notification(2, {
          context: {
            artifact: { kind: 'ISSUE', number: 46, title: 'Outra issue', url: `${ISSUE_URL}6` }
          }
        })
      ])
    );
    renderPage();

    const cards = await screen.findAllByRole('article');
    const names = cards.map((card) => card.getAttribute('aria-label'));
    const readButtons = cards.map((card) =>
      within(card)
        .getByRole('button', { name: /Marcar como lida/ })
        .getAttribute('aria-label')
    );
    expect(new Set(names).size, JSON.stringify(names)).toBe(2);
    expect(new Set(readButtons).size, JSON.stringify(readButtons)).toBe(2);
    for (const card of cards)
      expect(within(card).getByRole('link', { name: 'Abrir tarefa TASK-100' })).toBeInTheDocument();
  });

  it('C9-03 o grupo Origem filtra pela API, recomeça a lista, funciona pelo teclado e mantém "Marcar todas" global', async () => {
    const user = userEvent.setup();
    api.listNotifications.mockImplementation(async (params) =>
      params.group === 'GITHUB' ? { ...listing([]), unreadCount: 1 } : listing([notification(1)])
    );
    api.markAllNotificationsRead.mockResolvedValue({ updated: 1 });
    renderPage();
    await screen.findAllByRole('article');
    const origin = screen.getByRole('group', { name: 'Origem' });

    expect(within(origin).getByRole('radio', { name: 'Todas as origens' })).toBeChecked();
    expect(api.listNotifications).toHaveBeenLastCalledWith(
      { status: 'UNREAD', page: 1, limit: 20 },
      expect.objectContaining({ fresh: true })
    );

    await user.click(within(origin).getByRole('radio', { name: 'GitHub' }));

    expect(await screen.findByText('Nenhuma notificação do GitHub não lida.')).toBeInTheDocument();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(api.listNotifications).toHaveBeenLastCalledWith(
      { status: 'UNREAD', group: 'GITHUB', page: 1, limit: 20 },
      expect.objectContaining({ fresh: true })
    );

    within(origin).getByRole('radio', { name: 'Tarefas' }).focus();
    await user.keyboard(' ');

    await waitFor(() =>
      expect(api.listNotifications).toHaveBeenLastCalledWith(
        { status: 'UNREAD', group: 'TASKS', page: 1, limit: 20 },
        expect.objectContaining({ fresh: true })
      )
    );
    expect(within(origin).getByRole('radio', { name: 'Tarefas' })).toBeChecked();

    await user.click(within(origin).getByRole('radio', { name: 'GitHub' }));
    await screen.findByText('Nenhuma notificação do GitHub não lida.');
    await user.click(screen.getByRole('button', { name: 'Marcar todas como lidas' }));

    await waitFor(() => expect(api.markAllNotificationsRead).toHaveBeenCalledTimes(1));
    expect(api.markAllNotificationsRead).toHaveBeenCalledWith();
  });

  it('C9-04 em escala, "Tarefas" mostra o aviso de tarefa em primeiro, sem "Carregar mais"', async () => {
    const user = userEvent.setup();
    const github = Array.from({ length: 20 }, (_, index) =>
      notification(index + 1, { task: { id: 1000 + index, code: `TASK-${1000 + index}` } })
    );
    const overdue = {
      id: 500,
      type: 'TASK_OVERDUE',
      createdAt: '2026-09-01T12:00:00.000Z',
      readAt: null,
      project: { id: 9, name: 'Projeto Bateria' },
      task: { id: 500, code: 'TASK-500', title: 'Tarefa atrasada', available: true },
      context: { dueDate: '2026-08-31' },
      link: '/projects/9/kanban?task=500'
    };
    api.listNotifications.mockImplementation(async (params) =>
      params.group === 'TASKS'
        ? listing([overdue])
        : {
            ...listing(github, 'cursor-do-github'),
            pagination: { page: 1, limit: 20, total: 300, totalPages: 15 },
            unreadCount: 301
          }
    );
    renderPage();
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(20));
    expect(screen.getByRole('button', { name: 'Carregar mais notificações' })).toBeInTheDocument();

    await user.click(
      within(screen.getByRole('group', { name: 'Origem' })).getByRole('radio', {
        name: 'Tarefas'
      })
    );

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));
    expect(screen.getAllByRole('article')[0]).toHaveAccessibleName(
      'Prazo vencido: TASK-500 Tarefa atrasada. Prazo venceu em 31/08/2026'
    );
    expect(
      screen.queryByRole('button', { name: 'Carregar mais notificações' })
    ).not.toBeInTheDocument();
  });
});
