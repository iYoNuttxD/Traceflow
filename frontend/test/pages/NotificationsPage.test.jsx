import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router';
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
  UnreadNotificationsProvider,
  useUnreadNotifications
} from '../../src/features/notifications/index.js';
import { AppShell } from '../../src/app/layout/AppShell.jsx';
import { ThemeProvider } from '../../src/app/theme/ThemeProvider.jsx';
import { ProjectsCatalogProvider } from '../../src/features/projects/index.js';

function notification(id, overrides = {}) {
  return {
    id,
    type: 'TASK_STATUS_CHANGED',
    createdAt: '2026-10-09T14:30:00.000Z',
    readAt: null,
    project: { id: 9, name: 'Projeto Escala' },
    task: { id: 100 + id, code: `TASK-${100 + id}`, title: `Tarefa ${id}`, available: true },
    context: {
      fromStatus: 'EM_ANDAMENTO',
      toStatus: 'CONCLUIDO',
      actor: { id: 3, name: 'Ana Souza' }
    },
    link: `/projects/9/kanban?task=${100 + id}`,
    ...overrides
  };
}

function listing(items, { page = 1, totalPages = 1, total = items.length } = {}) {
  return {
    notifications: items,
    pagination: { page, limit: 20, total, totalPages },
    unreadCount: items.filter((item) => !item.readAt).length
  };
}

function apiError(status, { code, message, retryAfter } = {}) {
  const error = new Error('falha');
  error.response = {
    status,
    data: { code, message },
    headers: retryAfter ? { 'retry-after': String(retryAfter) } : {}
  };
  return error;
}

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Destino">{`${location.pathname}${location.search}`}</output>;
}

function CountProbe() {
  const { unreadCount } = useUnreadNotifications();
  return <output aria-label="Contador">{unreadCount}</output>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/notifications']}>
      <UnreadNotificationsProvider>
        <CountProbe />
        <Routes>
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/projects/:projectId/kanban" element={<LocationProbe />} />
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
});

describe('S2-02 central de notificações', () => {
  it('lista as não lidas por padrão com tipo, tarefa, projeto e contexto', async () => {
    api.listNotifications.mockResolvedValue(
      listing([
        notification(1),
        notification(2, {
          type: 'TASK_OVERDUE',
          context: { dueDate: '2026-10-10' }
        })
      ])
    );
    renderPage();

    const card = await waitFor(() => cardOf('TASK-101'));
    expect(api.listNotifications).toHaveBeenCalledWith(
      { status: 'UNREAD', page: 1, limit: 20 },
      expect.any(Object)
    );
    expect(within(card).getByText('Mudança de status')).toBeInTheDocument();
    expect(within(card).getByText('Não lida')).toBeInTheDocument();
    expect(within(card).getByText('Tarefa 1')).toBeInTheDocument();
    expect(within(card).getByText(/Projeto Escala/)).toBeInTheDocument();
    expect(
      within(card).getByText('Ana Souza moveu de Em andamento para Concluído')
    ).toBeInTheDocument();
    expect(within(cardOf('TASK-102')).getByText('Prazo venceu em 10/10/2026')).toBeInTheDocument();
  });

  it('alterna entre Não lidas e Todas', async () => {
    const user = userEvent.setup();
    api.listNotifications
      .mockResolvedValueOnce(listing([notification(1)]))
      .mockResolvedValueOnce(
        listing([notification(1), notification(3, { readAt: '2026-10-09T15:00:00.000Z' })])
      );
    renderPage();
    await waitFor(() => cardOf('TASK-101'));

    await user.click(screen.getByRole('radio', { name: 'Todas' }));

    await waitFor(() => cardOf('TASK-103'));
    expect(api.listNotifications).toHaveBeenLastCalledWith(
      { status: 'ALL', page: 1, limit: 20 },
      expect.any(Object)
    );
    expect(
      within(cardOf('TASK-103')).getByRole('button', { name: /Marcar como não lida/ })
    ).toBeInTheDocument();
  });

  it('mostra carregamento, vazio e erro com nova tentativa', async () => {
    const user = userEvent.setup();
    let resolve;
    api.listNotifications.mockReturnValueOnce(new Promise((done) => (resolve = done)));
    renderPage();
    expect(screen.getByText('Carregando notificações...')).toBeInTheDocument();
    await act(async () => resolve(listing([])));
    expect(await screen.findByText('Nenhuma notificação não lida.')).toBeInTheDocument();

    api.listNotifications.mockRejectedValueOnce(apiError(500));
    await user.click(screen.getByRole('radio', { name: 'Todas' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('O TRACEFLOW encontrou um problema interno.');
    api.listNotifications.mockResolvedValueOnce(listing([notification(4)]));
    await user.click(within(alert).getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => cardOf('TASK-104'));
  });

  it('429 informa a espera antes de permitir nova tentativa', async () => {
    api.listNotifications.mockRejectedValueOnce(apiError(429, { retryAfter: 30 }));
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('button', { name: 'Tentar novamente em 30s' })).toBeDisabled();
  });

  it('marca como lida e como não lida e atualiza o contador', async () => {
    const user = userEvent.setup();
    const item = notification(1);
    api.listNotifications.mockResolvedValue(listing([item]));
    api.getUnreadNotificationCount
      .mockResolvedValueOnce({ unreadCount: 1 })
      .mockResolvedValueOnce({ unreadCount: 0 })
      .mockResolvedValueOnce({ unreadCount: 1 });
    api.markNotification
      .mockResolvedValueOnce({ notification: { ...item, readAt: '2026-10-09T16:00:00.000Z' } })
      .mockResolvedValueOnce({ notification: item });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Contador')).toHaveTextContent('1'));

    await user.click(within(cardOf('TASK-101')).getByRole('button', { name: /Marcar como lida/ }));
    expect(api.markNotification).toHaveBeenCalledWith(1, true);
    await waitFor(() => expect(screen.getByLabelText('Contador')).toHaveTextContent('0'));
    expect(within(cardOf('TASK-101')).queryByText('Não lida')).not.toBeInTheDocument();

    await user.click(
      within(cardOf('TASK-101')).getByRole('button', { name: /Marcar como não lida/ })
    );
    expect(api.markNotification).toHaveBeenLastCalledWith(1, false);
    await waitFor(() => expect(screen.getByLabelText('Contador')).toHaveTextContent('1'));
  });

  it('marca todas como lidas, informa quantas e recarrega a lista e o contador', async () => {
    const user = userEvent.setup();
    api.listNotifications
      .mockResolvedValueOnce(listing([notification(1), notification(2)]))
      .mockResolvedValueOnce(listing([]));
    api.markAllNotificationsRead.mockResolvedValue({ updated: 2 });
    api.getUnreadNotificationCount.mockResolvedValue({ unreadCount: 2 });
    renderPage();
    await waitFor(() => cardOf('TASK-101'));
    const markAll = screen.getByRole('button', { name: 'Marcar todas como lidas' });
    await waitFor(() => expect(markAll).toHaveAttribute('aria-disabled', 'false'));
    const countCalls = api.getUnreadNotificationCount.mock.calls.length;

    await user.click(markAll);

    expect(await screen.findByText('2 notificações marcadas como lidas.')).toBeInTheDocument();
    expect(await screen.findByText('Nenhuma notificação não lida.')).toBeInTheDocument();
    expect(api.getUnreadNotificationCount.mock.calls.length).toBeGreaterThan(countCalls);
  });

  it('abrir a tarefa leva ao Kanban com o detalhe e marca a notificação como lida', async () => {
    const user = userEvent.setup();
    api.listNotifications.mockResolvedValue(listing([notification(1)]));
    api.markNotification.mockResolvedValue({ notification: notification(1) });
    renderPage();

    await user.click(await screen.findByRole('link', { name: 'Abrir tarefa TASK-101' }));

    expect(screen.getByLabelText('Destino')).toHaveTextContent('/projects/9/kanban?task=101');
    expect(api.markNotification).toHaveBeenCalledWith(1, true);
  });

  it('tarefa excluída aparece sem link', async () => {
    api.listNotifications.mockResolvedValue(
      listing([
        notification(1, {
          task: { id: null, code: null, title: 'Tarefa apagada', available: false },
          link: null
        })
      ])
    );
    renderPage();

    const card = await screen.findByRole('article', { name: /Tarefa apagada/ });
    expect(within(card).getByText('Tarefa excluída')).toBeInTheDocument();
    expect(within(card).queryByRole('link')).not.toBeInTheDocument();
  });

  it('acesso perdido: 404 ao marcar avisa sem detalhe técnico e recarrega lista e contador', async () => {
    const user = userEvent.setup();
    api.listNotifications
      .mockResolvedValueOnce(listing([notification(1)]))
      .mockResolvedValueOnce(listing([]));
    api.markNotification.mockRejectedValue(
      apiError(404, { code: 'NOTIFICATION_NOT_FOUND', message: 'Notificação não encontrada.' })
    );
    renderPage();
    await waitFor(() => cardOf('TASK-101'));
    const countCalls = api.getUnreadNotificationCount.mock.calls.length;

    await user.click(within(cardOf('TASK-101')).getByRole('button', { name: /Marcar como lida/ }));

    expect(
      await screen.findByText('Esta notificação não está mais disponível.')
    ).toBeInTheDocument();
    expect(await screen.findByText('Nenhuma notificação não lida.')).toBeInTheDocument();
    expect(api.listNotifications).toHaveBeenCalledTimes(2);
    expect(api.getUnreadNotificationCount.mock.calls.length).toBeGreaterThan(countCalls);
    expect(screen.queryByText(/NOTIFICATION_NOT_FOUND/)).not.toBeInTheDocument();
  });

  it('título vindo do usuário é exibido como texto', async () => {
    const title = '<img src=x onerror="window.__s202=1">';
    api.listNotifications.mockResolvedValue(
      listing([notification(1, { task: { id: 101, code: 'TASK-101', title, available: true } })])
    );
    const { container } = renderPage();

    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(window.__s202).toBeUndefined();
  });

  it('não guarda notificação no armazenamento do navegador', async () => {
    const user = userEvent.setup();
    api.listNotifications.mockResolvedValue(listing([notification(1)]));
    api.markNotification.mockResolvedValue({ notification: notification(1) });
    renderPage();
    await user.click(
      await within(await waitFor(() => cardOf('TASK-101'))).findByRole('button', {
        name: /Marcar como lida/
      })
    );
    await user.click(screen.getByRole('radio', { name: 'Todas' }));

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});

function mockViewport() {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }));
}

function renderShell() {
  return render(
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
}

describe('S2-02 contador no menu lateral', () => {
  beforeEach(() => {
    mockViewport();
    projects.list.mockResolvedValue({ data: { projects: [] } });
  });

  it('mostra Notificações sem contador quando não há não lidas', async () => {
    api.getUnreadNotificationCount.mockResolvedValue({ unreadCount: 0 });
    renderShell();

    const link = await screen.findByRole('link', { name: 'Notificações' });
    await waitFor(() => expect(api.getUnreadNotificationCount).toHaveBeenCalled());
    expect(link).toHaveAttribute('href', '/notifications');
    expect(link.querySelector('.trace-shell__badge')).toBeNull();
  });

  it('mostra o número e limita em 99+', async () => {
    api.getUnreadNotificationCount.mockResolvedValue({ unreadCount: 150 });
    renderShell();

    const link = await screen.findByRole('link', { name: 'Notificações, 150 não lidas' });
    expect(within(link).getByText('99+')).toBeInTheDocument();
  });
});

function Navigator() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/projects/1')}>
      Navegar
    </button>
  );
}

describe('S2-02 consulta periódica do contador (D12)', () => {
  let visibility;

  beforeEach(() => {
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('consulta ao montar, ao navegar e a cada 60 s só com a aba visível', async () => {
    api.getUnreadNotificationCount.mockResolvedValue({ unreadCount: 2 });
    render(
      <MemoryRouter initialEntries={['/projects']}>
        <UnreadNotificationsProvider>
          <CountProbe />
          <Navigator />
        </UnreadNotificationsProvider>
      </MemoryRouter>
    );
    await act(async () => {});
    expect(api.getUnreadNotificationCount).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Contador')).toHaveTextContent('2');

    await act(async () => vi.advanceTimersByTime(60_000));
    expect(api.getUnreadNotificationCount).toHaveBeenCalledTimes(2);

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Navegar' })));
    expect(api.getUnreadNotificationCount).toHaveBeenCalledTimes(3);

    visibility = 'hidden';
    await act(async () => vi.advanceTimersByTime(180_000));
    expect(api.getUnreadNotificationCount).toHaveBeenCalledTimes(3);

    visibility = 'visible';
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(api.getUnreadNotificationCount).toHaveBeenCalledTimes(4);
  });

  it('respeita o Retry-After de um 429 antes de consultar de novo', async () => {
    api.getUnreadNotificationCount
      .mockRejectedValueOnce(apiError(429, { retryAfter: 120 }))
      .mockResolvedValue({ unreadCount: 5 });
    render(
      <MemoryRouter>
        <UnreadNotificationsProvider>
          <CountProbe />
        </UnreadNotificationsProvider>
      </MemoryRouter>
    );
    await act(async () => {});
    expect(api.getUnreadNotificationCount).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTime(60_000));
    expect(api.getUnreadNotificationCount).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTime(60_000));
    expect(api.getUnreadNotificationCount).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Contador')).toHaveTextContent('5');
  });
});
