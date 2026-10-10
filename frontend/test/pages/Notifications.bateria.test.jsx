import { MemoryRouter, Route, Routes } from 'react-router';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  getUnreadNotificationCount: vi.fn(),
  markNotification: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  getNotificationPreferences: vi.fn(),
  saveNotificationPreferences: vi.fn()
}));
const projects = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../../src/features/notifications/api/notifications.api.js', () => api);
vi.mock('../../src/features/projects/api/projects.api.js', () => ({
  projectsApi: { list: projects.list }
}));

import { NotificationsPage } from '../../src/pages/NotificationsPage.jsx';
import {
  NotificationPreferencesPage,
  UnreadNotificationsProvider,
  useUnreadNotifications
} from '../../src/features/notifications/index.js';
import { formatDueDate } from '../../src/features/notifications/model/notification-view.js';
import { AppShell } from '../../src/app/layout/AppShell.jsx';
import { ThemeProvider } from '../../src/app/theme/ThemeProvider.jsx';
import { ProjectsCatalogProvider } from '../../src/features/projects/index.js';

function notification(id, overrides = {}) {
  return {
    id,
    type: 'TASK_STATUS_CHANGED',
    createdAt: new Date(Date.UTC(2026, 9, 1, id)).toISOString(),
    readAt: null,
    project: { id: 9, name: 'Projeto Escala' },
    task: { id: 100 + id, code: `TASK-${100 + id}`, title: `Tarefa ${id}`, available: true },
    context: {
      fromStatus: 'A_FAZER',
      toStatus: 'EM_ANDAMENTO',
      actor: { id: 3, name: 'Ana Souza' }
    },
    link: `/projects/9/kanban?task=${100 + id}`,
    ...overrides
  };
}

function offsetServer(items) {
  const store = items.map((item) => ({ ...item }));
  api.listNotifications.mockImplementation(async ({ status, page, limit }) => {
    const visible = store
      .filter((item) => status === 'ALL' || !item.readAt)
      .sort((a, b) => b.id - a.id);
    return {
      notifications: visible.slice((page - 1) * limit, page * limit),
      pagination: {
        page,
        limit,
        total: visible.length,
        totalPages: Math.ceil(visible.length / limit)
      },
      unreadCount: store.filter((item) => !item.readAt).length
    };
  });
  api.markNotification.mockImplementation(async (id, read) => {
    const item = store.find((candidate) => candidate.id === id);
    item.readAt = read ? new Date().toISOString() : null;
    return { notification: { ...item } };
  });
  api.getUnreadNotificationCount.mockImplementation(async () => ({
    unreadCount: store.filter((item) => !item.readAt).length
  }));
  return store;
}

function CountProbe() {
  const { unreadCount } = useUnreadNotifications();
  return <output aria-label="Contador">{unreadCount}</output>;
}

function renderCenter() {
  return render(
    <MemoryRouter initialEntries={['/notifications']}>
      <UnreadNotificationsProvider>
        <CountProbe />
        <Routes>
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/projects/:projectId/kanban" element={<p>Kanban aberto</p>} />
        </Routes>
      </UnreadNotificationsProvider>
    </MemoryRouter>
  );
}

const cardOf = (code) => screen.getByRole('article', { name: new RegExp(code) });

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  api.getUnreadNotificationCount.mockResolvedValue({ unreadCount: 0 });
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }));
  projects.list.mockResolvedValue({ data: { projects: [] } });
});

describe('S2-02 bateria frontend — contador no menu (NT-U-01)', () => {
  it.each([
    [1, '1', 'Notificações, 1 não lida'],
    [99, '99', 'Notificações, 99 não lidas'],
    [100, '99+', 'Notificações, 100 não lidas']
  ])('com %i não lidas mostra %s e o nome acessível certo', async (count, badge, label) => {
    api.getUnreadNotificationCount.mockResolvedValue({ unreadCount: count });
    render(
      <MemoryRouter initialEntries={['/projects']}>
        <ThemeProvider>
          <ProjectsCatalogProvider>
            <UnreadNotificationsProvider>
              <AppShell
                user={{ id: 7, name: 'João Teste', email: 'joao@example.invalid' }}
                onLogout={vi.fn()}
              >
                <p>Conteúdo</p>
              </AppShell>
            </UnreadNotificationsProvider>
          </ProjectsCatalogProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    const link = await screen.findByRole('link', { name: label });
    expect(within(link).getByText(badge)).toBeInTheDocument();
  });
});

describe('S2-02 bateria frontend — consulta periódica e logout (NT-U-02, NT-U-07)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('desmontar o provider (logout) encerra a consulta periódica', async () => {
    api.getUnreadNotificationCount.mockResolvedValue({ unreadCount: 3 });
    const view = render(
      <MemoryRouter>
        <UnreadNotificationsProvider>
          <CountProbe />
        </UnreadNotificationsProvider>
      </MemoryRouter>
    );
    await act(async () => {});
    const calls = api.getUnreadNotificationCount.mock.calls.length;

    view.unmount();
    await act(async () => vi.advanceTimersByTime(5 * 60_000));
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));

    expect(api.getUnreadNotificationCount).toHaveBeenCalledTimes(calls);
    expect(screen.queryByLabelText('Contador')).not.toBeInTheDocument();
    expect(window.localStorage.length + window.sessionStorage.length).toBe(0);
  });
});

describe('S2-02 bateria frontend — central (NT-U-04, NT-U-05)', () => {
  it('H3 no filtro Não lidas, a notificação marcada continua visível, mas com o estado de lida', async () => {
    const user = userEvent.setup();
    offsetServer([notification(1), notification(2)]);
    renderCenter();
    await waitFor(() => cardOf('TASK-102'));

    await user.click(within(cardOf('TASK-102')).getByRole('button', { name: /Marcar como lida/ }));

    const card = cardOf('TASK-102');
    expect(within(card).queryByText('Não lida')).not.toBeInTheDocument();
    expect(within(card).getByRole('button', { name: /Marcar como não lida/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Contador')).toHaveTextContent('1'));
  });

  it('marcar todas leva o foco ao título da lista e o botão fica inativo sem pendências', async () => {
    const user = userEvent.setup();
    const store = offsetServer([notification(1), notification(2)]);
    api.markAllNotificationsRead.mockImplementation(async () => {
      let updated = 0;
      for (const item of store)
        if (!item.readAt) {
          item.readAt = new Date().toISOString();
          updated += 1;
        }
      return { updated };
    });
    renderCenter();
    await waitFor(() => cardOf('TASK-102'));

    await user.click(screen.getByRole('button', { name: 'Marcar todas como lidas' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Não lidas' })).toHaveFocus());
    const button = screen.getByRole('button', { name: 'Marcar todas como lidas' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await user.click(button);
    expect(api.markAllNotificationsRead).toHaveBeenCalledTimes(1);
  });

  it('NT-U-06 nome do projeto e do ator com HTML aparecem como texto', async () => {
    const hostile = '<img src=x onerror="window.__s202bat=1">';
    offsetServer([
      notification(1, {
        project: { id: 9, name: `Projeto ${hostile}` },
        context: { fromStatus: 'A_FAZER', toStatus: 'CONCLUIDO', actor: { id: 3, name: hostile } }
      })
    ]);
    const { container } = renderCenter();

    await waitFor(() => cardOf('TASK-101'));
    const card = cardOf('TASK-101');
    expect(
      within(card).getByText(
        new RegExp(`Projeto ${hostile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
      )
    ).toBeInTheDocument();
    expect(
      within(card).getByText(`${hostile} moveu de A fazer para Concluído`)
    ).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(window.__s202bat).toBeUndefined();
  });
});

describe('S2-02 bateria frontend — preferências e datas (NT-U-08, NT-U-09)', () => {
  it('cada interruptor tem nome e descrição ligada por aria-describedby', async () => {
    api.getNotificationPreferences.mockResolvedValue({
      preferences: { TASK_STATUS_CHANGED: true, TASK_OVERDUE: true }
    });
    render(
      <MemoryRouter>
        <NotificationPreferencesPage />
      </MemoryRouter>
    );

    const boxes = await screen.findAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    for (const box of boxes) {
      const description = document.getElementById(box.getAttribute('aria-describedby'));
      expect(description?.textContent).toMatch(/Avisa/);
      expect(box).toHaveAccessibleDescription(description.textContent);
    }
  });

  it('a data do prazo não se desloca com o fuso do processo', () => {
    expect(formatDueDate('2026-01-01')).toBe('01/01/2026');
    expect(formatDueDate('2026-12-31')).toBe('31/12/2026');
    expect(formatDueDate('2026-10-10T00:00:00.000Z')).toBe('10/10/2026');
  });

  it('teclado: Enter no botão inativo de marcar todas não chama a API', async () => {
    offsetServer([]);
    renderCenter();
    const button = await screen.findByRole('button', { name: 'Marcar todas como lidas' });

    button.focus();
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.click(button);

    expect(api.markAllNotificationsRead).not.toHaveBeenCalled();
  });
});
