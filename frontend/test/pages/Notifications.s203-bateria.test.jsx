import { MemoryRouter, Route, Routes } from 'react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

import {
  NotificationsPanel,
  UnreadNotificationsProvider
} from '../../src/features/notifications/index.js';
import { formatInstant } from '../../src/features/notifications/model/notification-view.js';

const OCCURRED = '2026-10-12T13:03:00.000Z';
const CREATED = '2026-10-12T14:00:00.000Z';
const EXPECTED_DATE = new Map([
  ['America/Sao_Paulo', '12/10/2026 11:00'],
  ['Pacific/Kiritimati', '13/10/2026 04:00'],
  ['Pacific/Pago_Pago', '12/10/2026 03:00'],
  ['UTC', '12/10/2026 14:00'],
  ['Etc/UTC', '12/10/2026 14:00']
]);
const ISSUE_URL = 'https://github.com/usuario-s203/repositorio-s203/issues/45';
const PR_URL = 'https://github.com/usuario-s203/repositorio-s203/pull/8';
const XSS = '<img src=x onerror="window.__s203bateria=1">';
const closePanel = () => {};

function NotificationsPage() {
  return <NotificationsPanel onClose={closePanel} />;
}

function notification(id, overrides = {}) {
  const { context = {}, task = {}, project = {}, ...rest } = overrides;
  return {
    id,
    type: 'ISSUE_EVENT',
    createdAt: CREATED,
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
  it('EV-U-01 os quatro eventos mostram texto próprio e a data no fuso do navegador (painel, TF-REV-008)', async () => {
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
      (card) => card.querySelector('.notification-item__sentence').textContent
    );
    const verbs = [
      'Issue #45 fechada no GitHub · TASK-101',
      'Issue #45 reaberta no GitHub · TASK-102',
      'PR #8 mesclada no GitHub · TASK-103',
      'PR #8 fechada sem merge no GitHub · TASK-104'
    ];
    verbs.forEach((verb, index) => expect(texts[index]).toContain(verb));
    for (const card of cards) {
      const time = card.querySelector('time');
      expect(time).toHaveAttribute('datetime', CREATED);
      if (expectedDate) expect(time.textContent, zone).toBe(expectedDate);
      expect(within(card).queryByRole('link', { name: /Abrir no GitHub/ })).not.toBeInTheDocument();
      expect(card.querySelector('a[target="_blank"]')).toBeNull();
      expect(within(card).getByRole('link', { name: /no GitHub · TASK-/ })).toHaveAttribute(
        'href',
        '/projects/9/kanban?task=100'
      );
      expect(within(card).getByRole('button', { name: /Marcar como lida/ })).toBeInTheDocument();
    }
  });

  it('EV-U-03 títulos, nome do projeto e tarefa com HTML, script e quebra de linha aparecem como texto (painel, TF-REV-008)', async () => {
    api.listNotifications.mockResolvedValue(
      listing([
        notification(1, {
          project: { name: `Projeto ${XSS}` },
          task: {
            id: null,
            code: null,
            title: `Tarefa </script><script>window.__s203bateria=2</script>`,
            available: false
          },
          link: null,
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
    renderPage();

    const card = await screen.findByRole('article');
    expect(document.body.querySelector('img')).toBeNull();
    expect(document.body.querySelector('script')).toBeNull();
    expect(window.__s203bateria).toBeUndefined();
    const sentence = card.querySelector('.notification-item__sentence');
    expect(sentence.textContent).toContain(
      '“Tarefa </script><script>window.__s203bateria=2</script>”'
    );
    expect(sentence.textContent).not.toContain('\u202E');
    expect(card.querySelector('.notification-item__meta').textContent).toContain(`Projeto ${XSS}`);
    expect(card.textContent).not.toContain('quebrado');
    expect(card.textContent).toContain('</script><script>');
  });

  it('EV-U-04 título de 256 caracteres sem espaço fica na linha própria, com a classe que quebra em qualquer ponto (painel, TF-REV-008)', async () => {
    const title = `${'Título-longo-sem-espaço-'.repeat(11)}`.slice(0, 256);
    api.listNotifications.mockResolvedValue(
      listing([
        notification(1, {
          context: { artifact: { kind: 'ISSUE', number: 45, title, url: ISSUE_URL } }
        }),
        notification(2, { task: { id: null, code: null, title, available: false }, link: null })
      ])
    );
    renderPage();

    const [githubTitle, taskTitle] = await screen.findAllByRole('article');
    expect(githubTitle.textContent).not.toContain(title);
    const sentence = taskTitle.querySelector('.notification-item__sentence');
    expect(sentence.textContent).toBe(`Não lida: Issue #45 fechada no GitHub · “${title}”`);
    expect(sentence.parentElement).toHaveClass('notification-item__main');
    expect(getComputedStyle(sentence.parentElement).display).toBe('grid');
    expect(getComputedStyle(sentence).overflowWrap).toBe('anywhere');
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
    await user.click(screen.getByRole('tab', { name: 'Todas' }));

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
  it('C9-01 dois avisos da mesma tarefa e do mesmo tipo têm nomes distintos no cartão e no botão de leitura (EV-U-05) (painel, TF-REV-008)', async () => {
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
      expect(within(card).getByRole('link', { name: /· TASK-100/ })).toHaveAttribute(
        'href',
        '/projects/9/kanban?task=100'
      );
  });

  it('C9-03 o grupo Origem filtra pela API, recomeça a lista, funciona pelo teclado e mantém "Marcar todas" global (painel, TF-REV-008)', async () => {
    const user = userEvent.setup();
    api.listNotifications.mockImplementation(async (params) =>
      params.group === 'GITHUB' ? { ...listing([]), unreadCount: 1 } : listing([notification(1)])
    );
    api.markAllNotificationsRead.mockResolvedValue({ updated: 1 });
    renderPage();
    await screen.findAllByRole('article');
    const origin = screen.getByRole('combobox', { name: 'Origem' });

    expect(origin).toHaveValue('ALL');
    expect(within(origin).getByRole('option', { name: 'Todas' }).selected).toBe(true);
    expect(api.listNotifications).toHaveBeenLastCalledWith(
      { status: 'UNREAD', page: 1, limit: 20 },
      expect.objectContaining({ fresh: true })
    );

    await user.selectOptions(origin, 'GITHUB');

    expect(await screen.findByText('Nenhuma notificação do GitHub não lida.')).toBeInTheDocument();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(api.listNotifications).toHaveBeenLastCalledWith(
      { status: 'UNREAD', group: 'GITHUB', page: 1, limit: 20 },
      expect.objectContaining({ fresh: true })
    );

    screen.getByRole('tab', { name: /Não lidas/ }).focus();
    await user.tab();
    expect(origin).toHaveFocus();
    fireEvent.change(origin, { target: { value: 'TASKS' } });

    await waitFor(() =>
      expect(api.listNotifications).toHaveBeenLastCalledWith(
        { status: 'UNREAD', group: 'TASKS', page: 1, limit: 20 },
        expect.objectContaining({ fresh: true })
      )
    );
    expect(origin).toHaveValue('TASKS');

    await user.selectOptions(origin, 'GITHUB');
    await screen.findByText('Nenhuma notificação do GitHub não lida.');
    await user.click(screen.getByRole('button', { name: 'Marcar todas como lidas' }));

    await waitFor(() => expect(api.markAllNotificationsRead).toHaveBeenCalledTimes(1));
    expect(api.markAllNotificationsRead).toHaveBeenCalledWith();
  });

  it('C9-04 em escala, "Tarefas" mostra o aviso de tarefa em primeiro, sem "Carregar mais" (painel, TF-REV-008)', async () => {
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
    expect(
      screen.getByRole('button', { name: 'Carregar mais (280 restantes)' })
    ).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Origem' }), 'TASKS');

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));
    expect(screen.getAllByRole('article')[0]).toHaveAccessibleName(
      `Prazo vencido: TASK-500 venceu em 31/08/2026. Projeto Bateria, ${formatInstant(
        '2026-09-01T12:00:00.000Z'
      )}`
    );
    expect(screen.queryByRole('button', { name: /^Carregar mais/ })).not.toBeInTheDocument();
  });
});
