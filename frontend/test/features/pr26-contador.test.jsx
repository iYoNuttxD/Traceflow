import { MemoryRouter, Route, Routes } from 'react-router';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
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
import {
  UnreadNotificationsProvider,
  useUnreadNotifications
} from '../../src/features/notifications/index.js';

function notification(id, overrides = {}) {
  return {
    id,
    type: 'TASK_STATUS_CHANGED',
    createdAt: '2026-10-15T14:30:00.000Z',
    readAt: '2026-10-15T15:00:00.000Z',
    project: { id: 9, name: 'Projeto Escala' },
    task: { id: 100 + id, code: `TASK-${100 + id}`, title: `Tarefa ${id}`, available: true },
    context: {
      fromStatus: 'EM_ANDAMENTO',
      toStatus: 'CONCLUIDO',
      actor: { id: 3, name: 'Ana Souza' },
      selfAction: false
    },
    link: `/projects/9/kanban?task=${100 + id}`,
    ...overrides
  };
}

function listing(items) {
  return {
    notifications: items,
    pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 },
    unreadCount: items.filter((item) => !item.readAt).length,
    nextCursor: null
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function apiError(status, retryAfter) {
  const error = new Error('falha');
  error.response = {
    status,
    data: { code: 'RATE_LIMITED', message: 'Muitas requisições.' },
    headers: { 'retry-after': String(retryAfter) }
  };
  return error;
}

function Controls() {
  const { unreadCount, refresh, report, begin } = useUnreadNotifications();
  const ticket = useRef(null);
  return (
    <>
      <output aria-label="Contador">{unreadCount}</output>
      <button type="button" onClick={() => void refresh()}>
        Atualizar contador
      </button>
      <button type="button" onClick={() => report(2)}>
        Lista informa 2
      </button>
      <button type="button" onClick={() => (ticket.current = begin())}>
        Lista começa
      </button>
      <button type="button" onClick={() => report(5, ticket.current)}>
        Lista atrasada informa 5
      </button>
    </>
  );
}

function renderCentral() {
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

function renderControls() {
  return render(
    <MemoryRouter initialEntries={['/qualquer']}>
      <UnreadNotificationsProvider>
        <Controls />
      </UnreadNotificationsProvider>
    </MemoryRouter>
  );
}

const counter = () => screen.getByRole('status', { name: 'Contador' });
const markAllButton = () => screen.getByRole('button', { name: 'Marcar todas como lidas' });
const cardOf = (code) => screen.getByRole('article', { name: new RegExp(code) });

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('PR26 TF-REV-004: "Marcar todas" segue o contador único', () => {
  it('C-01 todas lidas, filtro Todas, marcar uma como não lida reabilita "Marcar todas"', async () => {
    const user = userEvent.setup();
    const read = notification(1);
    api.getUnreadNotificationCount.mockResolvedValue({ unreadCount: 0 });
    api.listNotifications.mockResolvedValue(listing([read]));
    api.markNotification.mockResolvedValue({ notification: { ...read, readAt: null } });
    api.markAllNotificationsRead.mockResolvedValue({ updated: 1 });
    renderCentral();

    await user.click(await screen.findByRole('radio', { name: 'Todas' }));
    await screen.findByRole('article', { name: /TASK-101/ });
    expect(markAllButton()).toHaveAttribute('aria-disabled', 'true');

    api.getUnreadNotificationCount.mockResolvedValue({ unreadCount: 1 });
    await user.click(
      within(cardOf('TASK-101')).getByRole('button', { name: /Marcar como não lida/ })
    );

    await waitFor(() => expect(markAllButton()).toHaveAttribute('aria-disabled', 'false'));
    await user.click(markAllButton());
    await waitFor(() => expect(api.markAllNotificationsRead).toHaveBeenCalledTimes(1));
  });

  it('C-02 duas notificações marcadas como não lidas em sequência deixam o contador em 2', async () => {
    const user = userEvent.setup();
    const first = notification(1);
    const second = notification(2);
    api.getUnreadNotificationCount.mockResolvedValue({ unreadCount: 0 });
    api.listNotifications.mockResolvedValue(listing([first, second]));
    api.markNotification.mockImplementation(async (id) => ({
      notification: { ...(id === 1 ? first : second), readAt: null }
    }));
    api.markAllNotificationsRead.mockResolvedValue({ updated: 2 });
    renderCentral();

    await user.click(await screen.findByRole('radio', { name: 'Todas' }));
    await screen.findByRole('article', { name: /TASK-102/ });
    api.getUnreadNotificationCount.mockResolvedValueOnce({ unreadCount: 1 });
    await user.click(
      within(cardOf('TASK-101')).getByRole('button', { name: /Marcar como não lida/ })
    );
    api.getUnreadNotificationCount.mockResolvedValueOnce({ unreadCount: 2 });
    await user.click(
      within(cardOf('TASK-102')).getByRole('button', { name: /Marcar como não lida/ })
    );

    await waitFor(() => expect(markAllButton()).toHaveAttribute('aria-disabled', 'false'));
    expect(api.getUnreadNotificationCount).toHaveBeenCalledTimes(3);
  });
});

describe('PR26 TF-REV-007: consulta antiga não sobrescreve contagem mais nova', () => {
  it('C-03 a consulta pendente que resolve depois do report é descartada', async () => {
    const user = userEvent.setup();
    const pending = deferred();
    api.getUnreadNotificationCount.mockReturnValueOnce(pending.promise);
    renderControls();

    await user.click(screen.getByRole('button', { name: 'Lista informa 2' }));
    expect(counter()).toHaveTextContent('2');

    await act(async () => pending.resolve({ unreadCount: 9 }));
    expect(counter()).toHaveTextContent('2');
  });

  it('C-04 a consulta que resolve antes do report é substituída pelo report', async () => {
    const user = userEvent.setup();
    api.getUnreadNotificationCount.mockResolvedValue({ unreadCount: 9 });
    renderControls();

    await waitFor(() => expect(counter()).toHaveTextContent('9'));
    await user.click(screen.getByRole('button', { name: 'Lista informa 2' }));
    expect(counter()).toHaveTextContent('2');
  });

  it('C-05 o recuo de 429 continua valendo', async () => {
    const user = userEvent.setup();
    api.getUnreadNotificationCount.mockRejectedValueOnce(apiError(429, 30));
    renderControls();
    await waitFor(() => expect(api.getUnreadNotificationCount).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'Atualizar contador' }));

    expect(api.getUnreadNotificationCount).toHaveBeenCalledTimes(1);
  });

  it('C-06 a lista que começou antes da consulta e respondeu depois não vence', async () => {
    const user = userEvent.setup();
    api.getUnreadNotificationCount.mockResolvedValueOnce({ unreadCount: 1 });
    renderControls();
    await waitFor(() => expect(counter()).toHaveTextContent('1'));

    await user.click(screen.getByRole('button', { name: 'Lista começa' }));
    api.getUnreadNotificationCount.mockResolvedValueOnce({ unreadCount: 7 });
    await user.click(screen.getByRole('button', { name: 'Atualizar contador' }));
    await waitFor(() => expect(counter()).toHaveTextContent('7'));
    await user.click(screen.getByRole('button', { name: 'Lista atrasada informa 5' }));

    expect(counter()).toHaveTextContent('7');
  });
});
