import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MemoryRouter, Route, Routes } from 'react-router';
import { act, render, screen, waitFor, within } from '@testing-library/react';
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

import {
  NotificationsPanel,
  UnreadNotificationsProvider,
  useUnreadNotifications
} from '../../src/features/notifications/index.js';
import { AppShell } from '../../src/app/layout/AppShell.jsx';
import { ThemeProvider } from '../../src/app/theme/ThemeProvider.jsx';
import { ProjectsCatalogProvider } from '../../src/features/projects/index.js';

const closePanel = () => {};

function NotificationsPage() {
  return <NotificationsPanel onClose={closePanel} />;
}

function notification(id, overrides = {}) {
  return {
    id,
    type: 'TASK_STATUS_CHANGED',
    createdAt: new Date(Date.UTC(2026, 0, 1) + id * 60_000).toISOString(),
    readAt: null,
    project: { id: 9, name: 'Projeto Reteste' },
    task: { id: 1000 + id, code: `TASK-${1000 + id}`, title: `Tarefa ${id}`, available: true },
    context: { fromStatus: 'A_FAZER', toStatus: 'EM_ANDAMENTO', actor: { id: 3, name: 'Ana' } },
    link: `/projects/9/kanban?task=${1000 + id}`,
    ...overrides
  };
}

function cursorServer(items) {
  const store = items.map((item) => ({ ...item }));
  api.listNotifications.mockImplementation(async ({ status, page, cursor, limit }) => {
    const visible = store
      .filter((item) => status === 'ALL' || !item.readAt)
      .sort((a, b) => b.id - a.id);
    const after = cursor ? visible.findIndex((item) => item.id < Number(cursor)) : -1;
    const start = cursor ? (after === -1 ? visible.length : after) : (page - 1) * limit;
    const slice = visible.slice(start, start + limit);
    return {
      notifications: slice,
      pagination: {
        page: cursor ? null : page,
        limit,
        total: visible.length,
        totalPages: Math.ceil(visible.length / limit)
      },
      unreadCount: store.filter((item) => !item.readAt).length,
      nextCursor: start + limit < visible.length ? String(slice.at(-1).id) : null
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

function deferred() {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((ok, fail) => {
    resolvePromise = ok;
    rejectPromise = fail;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function apiError(status) {
  const error = new Error('falha');
  error.response = { status, data: {}, headers: {} };
  return error;
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
        </Routes>
      </UnreadNotificationsProvider>
    </MemoryRouter>
  );
}

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/projects']}>
      <ThemeProvider>
        <ProjectsCatalogProvider>
          <UnreadNotificationsProvider>
            <AppShell
              user={{ id: 7, name: 'Pessoa Reteste', email: 'pessoa@example.invalid' }}
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

const cardOf = (code) => screen.getByRole('article', { name: new RegExp(`${code} `) });
const markButton = (code) =>
  within(cardOf(code)).getByRole('button', { name: /Marcar como (não )?lida/ });
const menuButton = () => document.querySelector('[aria-controls="traceflow-global-navigation"]');
const mobileBell = () =>
  document.querySelector('.trace-shell__mobile-actions [aria-haspopup="dialog"]');
const many = (count) => Array.from({ length: count }, (_, index) => notification(index + 1));

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

describe('S2-02 reteste — correções na tela (bloco V)', () => {
  it('RT-V-09 marcar três cartões em sequência rápida: três chamadas, três estados finais e contador coerente', async () => {
    const user = userEvent.setup();
    cursorServer(many(5));
    renderCenter();
    await waitFor(() => cardOf('TASK-1005'));

    for (const code of ['TASK-1005', 'TASK-1004', 'TASK-1003']) await user.click(markButton(code));

    await waitFor(() => expect(screen.getByLabelText('Contador')).toHaveTextContent('2'));
    expect(api.markNotification.mock.calls.map(([id]) => id)).toEqual([5, 4, 3]);
    for (const code of ['TASK-1005', 'TASK-1004', 'TASK-1003'])
      expect(markButton(code)).toHaveAccessibleName(/Marcar como não lida/);
  });

  it.each([
    [0, 'Abrir navegação', 'Notificações', false],
    [1, 'Abrir navegação', 'Notificações, 1 não lida', true],
    [99, 'Abrir navegação', 'Notificações, 99 não lidas', true],
    [150, 'Abrir navegação', 'Notificações, 150 não lidas', true]
  ])(
    'RT-V-10 com %i não lidas o ☰ continua "%s" e o sino do celular se chama "%s" (painel, TF-REV-008)',
    async (count, label, bellLabel, dot) => {
      api.getUnreadNotificationCount.mockResolvedValue({ unreadCount: count });
      renderShell();

      await waitFor(() => expect(mobileBell()).toHaveAttribute('aria-label', bellLabel));
      expect(menuButton()).toHaveAttribute('aria-label', label);
      expect(menuButton().querySelector('.trace-shell__menu-dot')).toBeNull();
      expect(Boolean(mobileBell().querySelector('.trace-shell__menu-dot'))).toBe(dot);
    }
  );
});

describe('S2-02 reteste — central depois das correções (N-U)', () => {
  it('RT-N-U-01 trocar de filtro durante o "Carregar mais" não mistura listas nem reusa o cursor do filtro anterior', async () => {
    const user = userEvent.setup();
    cursorServer([
      ...many(25),
      ...many(5).map((item) => notification(item.id + 100, { readAt: '2026-10-01T00:00:00.000Z' }))
    ]);
    renderCenter();
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(20));
    const late = deferred();
    const serve = api.listNotifications.getMockImplementation();
    api.listNotifications.mockImplementationOnce(() => late.promise);

    await user.click(screen.getByRole('button', { name: 'Carregar mais (5 restantes)' }));
    await user.click(screen.getByRole('tab', { name: 'Todas' }));
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(20));
    await act(async () => late.resolve(await serve({ status: 'UNREAD', cursor: '6', limit: 20 })));
    await user.click(screen.getByRole('button', { name: 'Carregar mais (10 restantes)' }));
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(30));

    const allCalls = api.listNotifications.mock.calls.filter(([query]) => query.status === 'ALL');
    expect(allCalls.map(([query]) => query)).toEqual([
      { status: 'ALL', page: 1, limit: 20 },
      { status: 'ALL', cursor: '11', limit: 20 }
    ]);
    const labels = screen.getAllByRole('article').map((card) => card.getAttribute('aria-label'));
    expect(new Set(labels).size).toBe(30);
  });

  it('RT-N-U-02 404 num cartão com outro cartão ocupado: recarrega, e o ocupado termina sem travar', async () => {
    const user = userEvent.setup();
    cursorServer(many(3));
    const pending = deferred();
    api.markNotification
      .mockImplementationOnce(() => pending.promise)
      .mockImplementationOnce(() => Promise.reject(apiError(404)));
    renderCenter();
    await waitFor(() => cardOf('TASK-1003'));

    await user.click(markButton('TASK-1003'));
    await user.click(markButton('TASK-1002'));
    expect(
      await screen.findByText('Esta notificação não está mais disponível.')
    ).toBeInTheDocument();
    await act(async () =>
      pending.resolve({ notification: notification(3, { readAt: '2026-10-02T00:00:00.000Z' }) })
    );

    await waitFor(() => expect(markButton('TASK-1003')).not.toHaveAttribute('aria-busy'));
    expect(markButton('TASK-1002')).not.toHaveAttribute('aria-busy');
  });

  it('RT-N-U-03 duas marcações resolvidas fora de ordem deixam cada cartão e o contador coerentes', async () => {
    const user = userEvent.setup();
    const store = cursorServer(many(3));
    const first = deferred();
    const second = deferred();
    api.markNotification
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    renderCenter();
    await waitFor(() => cardOf('TASK-1003'));

    await user.click(markButton('TASK-1003'));
    await user.click(markButton('TASK-1002'));
    store.find((item) => item.id === 2).readAt = '2026-10-02T00:00:00.000Z';
    await act(async () =>
      second.resolve({ notification: { ...store.find((item) => item.id === 2) } })
    );
    store.find((item) => item.id === 3).readAt = '2026-10-02T00:00:00.000Z';
    await act(async () =>
      first.resolve({ notification: { ...store.find((item) => item.id === 3) } })
    );

    await waitFor(() => expect(screen.getByLabelText('Contador')).toHaveTextContent('1'));
    expect(markButton('TASK-1003')).toHaveAccessibleName(/Marcar como não lida/);
    expect(markButton('TASK-1002')).toHaveAccessibleName(/Marcar como não lida/);
    expect(markButton('TASK-1001')).toHaveAccessibleName(/Marcar como lida/);
  });

  it('RT-N-U-04 falha num cartão enquanto outro está ocupado: o que falhou sai do estado ocupado; o outro continua', async () => {
    const user = userEvent.setup();
    cursorServer(many(3));
    const pending = deferred();
    api.markNotification
      .mockImplementationOnce(() => pending.promise)
      .mockImplementationOnce(() => Promise.reject(apiError(500)));
    renderCenter();
    await waitFor(() => cardOf('TASK-1003'));

    await user.click(markButton('TASK-1003'));
    await user.click(markButton('TASK-1002'));

    expect(await screen.findByRole('alert')).toHaveTextContent(/problema interno/);
    expect(markButton('TASK-1002')).not.toHaveAttribute('aria-busy');
    expect(markButton('TASK-1003')).toHaveAttribute('aria-busy', 'true');
    await act(async () =>
      pending.resolve({ notification: notification(3, { readAt: '2026-10-02T00:00:00.000Z' }) })
    );
    await waitFor(() => expect(markButton('TASK-1003')).not.toHaveAttribute('aria-busy'));
  });

  describe('com relógio controlado', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('RT-N-U-06 o rótulo do sino do celular acompanha a contagem, sem região viva que anuncie cada consulta (painel, TF-REV-008)', async () => {
      api.getUnreadNotificationCount
        .mockResolvedValueOnce({ unreadCount: 2 })
        .mockResolvedValue({ unreadCount: 5 });
      renderShell();
      await act(async () => {});
      expect(mobileBell()).toHaveAttribute('aria-label', 'Notificações, 2 não lidas');

      await act(async () => vi.advanceTimersByTime(60_000));

      expect(mobileBell()).toHaveAttribute('aria-label', 'Notificações, 5 não lidas');
      expect(menuButton()).toHaveAttribute('aria-label', 'Abrir navegação');
      expect(mobileBell().closest('[aria-live]')).toBeNull();
      expect(mobileBell().querySelector('[aria-live]')).toBeNull();
    });
  });

  it('RT-N-U-07 nenhum código do frontend usa pagination.page ou totalPages da lista de notificações', () => {
    const root = resolve('src');
    const files = [];
    const walk = (directory) => {
      for (const name of readdirSync(directory)) {
        const path = join(directory, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(js|jsx)$/.test(name)) files.push(path);
      }
    };
    walk(root);
    const offenders = files.filter((file) => {
      const text = readFileSync(file, 'utf8');
      return /notification/i.test(file) && /totalPages|pagination\.page/.test(text);
    });

    expect(offenders).toEqual([]);
  });

  it.each([
    [21, true],
    [20, false]
  ])('RT-N-U-08 com %i não lidas o "Carregar mais" aparece: %s', async (count, visible) => {
    cursorServer(many(count));
    renderCenter();
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(20));

    expect(Boolean(screen.queryByRole('button', { name: /^Carregar mais/ }))).toBe(visible);
  });

  it('RT-N-U-09 300 não lidas: 14 "Carregar mais" sem repetir cartão; tempo registrado', async () => {
    const user = userEvent.setup();
    cursorServer(many(300));
    renderCenter();
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(20));
    const panel = screen.getByRole('tabpanel');
    const started = performance.now();

    for (let click = 1; click <= 14; click += 1) {
      const name = `Carregar mais (${300 - 20 * click} restantes)`;
      // Locate by text, then check this button's semantics without recomputing every
      // notification toggle's accessible name on each growing page.
      const button = within(panel).getByText(name, { selector: 'button' });
      expect(button).toHaveRole('button');
      expect(button).toHaveAccessibleName(name);
      expect(button).toBeVisible();
      expect(button).toBeEnabled();
      await user.click(button);
      await waitFor(() =>
        expect(within(panel).getAllByRole('article')).toHaveLength(20 * (click + 1))
      );
    }

    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(300);
    const labels = cards.map((card) => card.getAttribute('aria-label'));
    process.stdout.write(
      `RT-N-U-09 ${JSON.stringify({ cards: labels.length, ms: Math.round(performance.now() - started) })}\n`
    );
    expect(new Set(labels).size).toBe(300);
    expect(screen.queryByRole('button', { name: /^Carregar mais/ })).not.toBeInTheDocument();
  }, 120000);
});
