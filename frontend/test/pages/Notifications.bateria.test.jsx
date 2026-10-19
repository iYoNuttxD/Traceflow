import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useEffect } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
  NotificationPreferencesPage,
  NotificationsPanel,
  UnreadNotificationsProvider,
  useUnreadNotifications
} from '../../src/features/notifications/index.js';
import {
  formatDueDate,
  formatInstant,
  markAllMessage,
  notificationSentence,
  notificationTypeLabel,
  taskStatusLabel,
  unreadBadge
} from '../../src/features/notifications/model/notification-view.js';
import { useNotifications } from '../../src/features/notifications/hooks/useNotifications.js';
import { httpClient } from '../../src/api/http-client.js';
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

function listing(items, { page = 1, totalPages = 1 } = {}) {
  return {
    notifications: items,
    pagination: { page, limit: 20, total: items.length, totalPages },
    unreadCount: items.filter((item) => !item.readAt).length,
    nextCursor: null
  };
}

function apiError(status, retryAfter) {
  const error = new Error('falha');
  error.response = {
    status,
    data: {},
    headers: retryAfter ? { 'retry-after': String(retryAfter) } : {}
  };
  return error;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const READ_AT = '2026-10-02T12:00:00.000Z';
const twentyFive = () => Array.from({ length: 25 }, (_, index) => notification(index + 1));

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

    const bell = await screen.findByRole('button', { name: label });
    expect(within(bell).getByText(badge)).toBeInTheDocument();
  });
});

describe('S2-02 correções — indicador no botão de navegação do celular (O-7)', () => {
  it.each([
    [0, 'Abrir navegação', 'Notificações', false],
    [1, 'Abrir navegação', 'Notificações, 1 não lida', true],
    [3, 'Abrir navegação', 'Notificações, 3 não lidas', true]
  ])(
    'C3-03 com %i não lidas o ☰ continua "%s" e o sino do celular se chama "%s" (painel, TF-REV-008)',
    async (count, label, bellLabel, dot) => {
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

      const menuButton = () =>
        document.querySelector('[aria-controls="traceflow-global-navigation"]');
      const mobileBell = () =>
        document.querySelector('.trace-shell__mobile-actions [aria-haspopup="dialog"]');
      await waitFor(() => expect(mobileBell()).toHaveAttribute('aria-label', bellLabel));
      expect(menuButton()).toHaveAttribute('aria-label', label);
      expect(menuButton().querySelector('.trace-shell__menu-dot')).toBeNull();
      const marker = mobileBell().querySelector('.trace-shell__menu-dot');
      expect(Boolean(marker)).toBe(dot);
      if (marker) expect(marker).toHaveAttribute('aria-hidden', 'true');
    }
  );
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
    expect(within(card).queryByText('Não lida:')).not.toBeInTheDocument();
    expect(within(card).getByRole('button', { name: /Marcar como não lida/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Contador')).toHaveTextContent('1'));
  });

  it('marcar todas leva o foco ao título do painel e o botão fica inativo sem pendências (painel, TF-REV-008)', async () => {
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

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Notificações' })).toHaveFocus()
    );
    const button = screen.getByRole('button', { name: 'Marcar todas como lidas' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await user.click(button);
    expect(api.markAllNotificationsRead).toHaveBeenCalledTimes(1);
  });

  it('NT-U-06 nome do projeto e do ator com HTML aparecem como texto (painel, TF-REV-008)', async () => {
    const hostile = '<img src=x onerror="window.__s202bat=1">';
    offsetServer([
      notification(1, {
        project: { id: 9, name: `Projeto ${hostile}` },
        context: { fromStatus: 'A_FAZER', toStatus: 'CONCLUIDO', actor: { id: 3, name: hostile } }
      })
    ]);
    renderCenter();

    await waitFor(() => cardOf('TASK-101'));
    const card = cardOf('TASK-101');
    expect(
      within(card).getByText(
        new RegExp(`Projeto ${hostile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
      )
    ).toBeInTheDocument();
    expect(within(card).getByText(`${hostile} moveu TASK-101 para Concluído`)).toBeInTheDocument();
    expect(document.body.querySelector('img')).toBeNull();
    expect(window.__s202bat).toBeUndefined();
  });
});

describe('S2-02 bateria frontend — preferências e datas (NT-U-08, NT-U-09)', () => {
  it('cada interruptor tem nome e descrição ligada por aria-describedby', async () => {
    api.getNotificationPreferences.mockResolvedValue({
      preferences: {
        TASK_STATUS_CHANGED: true,
        TASK_OVERDUE: true,
        ISSUE_EVENT: true,
        PULL_REQUEST_EVENT: true,
        TRACEABILITY_INCONSISTENCY: true
      }
    });
    render(
      <MemoryRouter>
        <NotificationPreferencesPage />
      </MemoryRouter>
    );

    const boxes = await screen.findAllByRole('checkbox');
    expect(boxes).toHaveLength(5);
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

describe('S2-02 bateria frontend — paginação e corridas da central (NT-U-04, NT-L)', () => {
  it('Carregar mais segue pelo cursor: uma chegada nova não desloca nem repete', async () => {
    const user = userEvent.setup();
    const store = offsetServer(twentyFive());
    renderCenter();
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(20));

    store.push(notification(26));
    await user.click(screen.getByRole('button', { name: 'Carregar mais (5 restantes)' }));

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(25));
    const labels = screen.getAllByRole('article').map((card) => card.getAttribute('aria-label'));
    expect(new Set(labels).size).toBe(25);
    expect(screen.queryByRole('article', { name: /TASK-126/ })).not.toBeInTheDocument();
    expect(api.listNotifications).toHaveBeenLastCalledWith(
      { status: 'UNREAD', cursor: '6', limit: 20 },
      expect.objectContaining({ fresh: true })
    );
    expect(screen.queryByRole('button', { name: /^Carregar mais/ })).not.toBeInTheDocument();
  });

  it('falha ao carregar mais mantém a página 1 e a nova tentativa repete o mesmo cursor', async () => {
    const user = userEvent.setup();
    offsetServer(twentyFive());
    renderCenter();
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(20));

    api.listNotifications.mockRejectedValueOnce(apiError(500));
    await user.click(screen.getByRole('button', { name: 'Carregar mais (5 restantes)' }));

    const alert = await screen.findByRole('alert');
    expect(screen.getAllByRole('article')).toHaveLength(20);
    expect(screen.queryByRole('button', { name: /^Carregar mais/ })).not.toBeInTheDocument();

    await user.click(within(alert).getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(25));
    expect(api.listNotifications).toHaveBeenLastCalledWith(
      { status: 'UNREAD', cursor: '6', limit: 20 },
      expect.anything()
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('resposta atrasada do filtro anterior não sobrescreve a lista nem o contador do filtro novo (painel, TF-REV-008)', async () => {
    const user = userEvent.setup();
    const late = deferred();
    api.listNotifications.mockImplementation(({ status }) =>
      status === 'UNREAD'
        ? late.promise
        : Promise.resolve(listing([notification(2, { readAt: READ_AT })]))
    );
    renderCenter();

    await user.click(screen.getByRole('tab', { name: 'Todas' }));
    await waitFor(() => cardOf('TASK-102'));
    await act(async () => late.resolve(listing([notification(1)])));

    expect(screen.queryByRole('article', { name: /TASK-101/ })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Todas' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Carregando notificações...')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Contador')).toHaveTextContent('0');
  });

  it('falha atrasada do filtro anterior não aparece como erro no filtro novo', async () => {
    const user = userEvent.setup();
    const late = deferred();
    api.listNotifications.mockImplementation(({ status }) =>
      status === 'UNREAD' ? late.promise : Promise.resolve(listing([notification(2)]))
    );
    renderCenter();

    await user.click(screen.getByRole('tab', { name: 'Todas' }));
    await waitFor(() => cardOf('TASK-102'));
    await act(async () => late.reject(apiError(500)));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(cardOf('TASK-102')).toBeInTheDocument();
  });

  it('marcação concluída durante a troca de filtro não ressuscita a lista anterior', async () => {
    const user = userEvent.setup();
    const marking = deferred();
    const allList = deferred();
    api.listNotifications.mockImplementation(({ status }) =>
      status === 'UNREAD' ? Promise.resolve(listing([notification(1)])) : allList.promise
    );
    api.markNotification.mockReturnValue(marking.promise);
    renderCenter();
    await waitFor(() => cardOf('TASK-101'));

    await user.click(within(cardOf('TASK-101')).getByRole('button', { name: /Marcar como lida/ }));
    await user.click(screen.getByRole('tab', { name: 'Todas' }));
    await act(async () => marking.resolve({ notification: notification(1, { readAt: READ_AT }) }));

    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.getByText('Carregando notificações...')).toBeInTheDocument();

    await act(async () =>
      allList.resolve(listing([notification(2), notification(1, { readAt: READ_AT })]))
    );
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });

  it('C3-02 com uma marcação em andamento, marcar outro cartão também chama a API (O-2)', async () => {
    const user = userEvent.setup();
    const first = deferred();
    const second = deferred();
    offsetServer([notification(1), notification(2)]);
    api.markNotification.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    renderCenter();
    await waitFor(() => cardOf('TASK-102'));

    await user.click(within(cardOf('TASK-102')).getByRole('button', { name: /Marcar como lida/ }));
    await user.click(within(cardOf('TASK-101')).getByRole('button', { name: /Marcar como lida/ }));

    expect(api.markNotification.mock.calls).toEqual([
      [2, true],
      [1, true]
    ]);
    for (const code of ['TASK-102', 'TASK-101'])
      expect(
        within(cardOf(code)).getByRole('button', { name: /Marcar como lida/ })
      ).toHaveAttribute('aria-busy', 'true');

    await user.click(within(cardOf('TASK-102')).getByRole('button', { name: /Marcar como lida/ }));
    expect(api.markNotification).toHaveBeenCalledTimes(2);

    await act(async () => first.resolve({ notification: notification(2, { readAt: READ_AT }) }));
    await act(async () => second.resolve({ notification: notification(1, { readAt: READ_AT }) }));
    for (const code of ['TASK-102', 'TASK-101'])
      expect(
        within(cardOf(code)).getByRole('button', { name: /Marcar como não lida/ })
      ).not.toHaveAttribute('aria-busy');
  });

  it('C3-01 H1 na tela: marcar como lidas e "Carregar mais" mostra as não lidas seguintes (S202-A01)', async () => {
    const user = userEvent.setup();
    offsetServer(twentyFive());
    renderCenter();
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(20));

    for (const code of ['TASK-125', 'TASK-124', 'TASK-123', 'TASK-122']) {
      await user.click(within(cardOf(code)).getByRole('button', { name: /Marcar como lida/ }));
      await waitFor(() =>
        expect(
          within(cardOf(code)).getByRole('button', { name: /Marcar como não lida/ })
        ).toBeInTheDocument()
      );
    }
    await user.click(screen.getByRole('button', { name: 'Carregar mais (5 restantes)' }));

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(25));
    const labels = screen.getAllByRole('article').map((card) => card.getAttribute('aria-label'));
    expect(new Set(labels).size).toBe(25);
    for (const code of ['TASK-105', 'TASK-104', 'TASK-103', 'TASK-102', 'TASK-101'])
      expect(cardOf(code)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Carregar mais/ })).not.toBeInTheDocument();
  });

  it('abrir uma tarefa já lida leva ao Kanban sem nova marcação (painel, TF-REV-008)', async () => {
    const user = userEvent.setup();
    offsetServer([notification(1, { readAt: READ_AT })]);
    renderCenter();

    await user.click(await screen.findByRole('tab', { name: 'Todas' }));
    await user.click(
      await screen.findByRole('link', { name: /Ana Souza moveu TASK-101 para Em andamento/ })
    );

    expect(await screen.findByText('Kanban aberto')).toBeInTheDocument();
    expect(api.markNotification).not.toHaveBeenCalled();
  });

  it.each([
    [429, 30, /Muitas solicitações[\s\S]*Tente novamente em 30s/],
    [500, undefined, /problema interno/]
  ])('falha %i ao marcar avisa e não recarrega a lista', async (status, retryAfter, message) => {
    const user = userEvent.setup();
    offsetServer([notification(1)]);
    api.markNotification.mockRejectedValueOnce(apiError(status, retryAfter));
    renderCenter();
    await waitFor(() => cardOf('TASK-101'));
    const loads = api.listNotifications.mock.calls.length;

    await user.click(within(cardOf('TASK-101')).getByRole('button', { name: /Marcar como lida/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(api.listNotifications).toHaveBeenCalledTimes(loads);
    expect(within(cardOf('TASK-101')).getByText('Não lida:')).toBeInTheDocument();
  });

  it('falha ao marcar todas avisa e mantém as pendências', async () => {
    const user = userEvent.setup();
    offsetServer([notification(1)]);
    api.markAllNotificationsRead.mockRejectedValueOnce(apiError(500));
    renderCenter();
    await waitFor(() => cardOf('TASK-101'));

    await user.click(screen.getByRole('button', { name: 'Marcar todas como lidas' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/problema interno/);
    expect(within(cardOf('TASK-101')).getByText('Não lida:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Marcar todas como lidas' })).toHaveAttribute(
      'aria-disabled',
      'false'
    );
  });

  it('changeStatus para o filtro atual não refaz a consulta nem limpa a lista', async () => {
    offsetServer([notification(1)]);
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.data?.notifications).toHaveLength(1));

    act(() => result.current.changeStatus('UNREAD'));

    expect(result.current.data?.notifications).toHaveLength(1);
    expect(api.listNotifications).toHaveBeenCalledTimes(1);
  });
});

describe('S2-02 bateria frontend — contador fora do caminho feliz (NT-U-02)', () => {
  function ReportProbe({ value }) {
    const { unreadCount, report } = useUnreadNotifications();
    return (
      <>
        <output aria-label="Contador">{unreadCount}</output>
        <button type="button" onClick={() => report(value)}>
          Informar
        </button>
      </>
    );
  }

  it.each([
    [-1, '2'],
    [1.5, '2'],
    ['3', '2'],
    [Number.NaN, '2'],
    [null, '2'],
    [0, '0'],
    [7, '7']
  ])('a central informar %s deixa o contador em %s', async (value, expected) => {
    api.getUnreadNotificationCount.mockResolvedValue({ unreadCount: 2 });
    render(
      <MemoryRouter>
        <UnreadNotificationsProvider>
          <ReportProbe value={value} />
        </UnreadNotificationsProvider>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByLabelText('Contador')).toHaveTextContent('2'));

    fireEvent.click(screen.getByRole('button', { name: 'Informar' }));

    expect(screen.getByLabelText('Contador')).toHaveTextContent(expected);
  });

  it('fora do provider o contador é zero e refresh e report não chamam a API', async () => {
    function DetachedProbe() {
      const { unreadCount, refresh, report } = useUnreadNotifications();
      useEffect(() => {
        report(5);
        void refresh();
      }, [refresh, report]);
      return <output aria-label="Contador">{unreadCount}</output>;
    }
    render(<DetachedProbe />);
    await act(async () => {});

    expect(screen.getByLabelText('Contador')).toHaveTextContent('0');
    expect(api.getUnreadNotificationCount).not.toHaveBeenCalled();
  });

  describe('com relógio controlado', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const mountCounter = () =>
      render(
        <MemoryRouter>
          <UnreadNotificationsProvider>
            <CountProbe />
          </UnreadNotificationsProvider>
        </MemoryRouter>
      );

    it('erro diferente de 429 não suspende a próxima consulta', async () => {
      api.getUnreadNotificationCount
        .mockRejectedValueOnce(apiError(500))
        .mockResolvedValue({ unreadCount: 4 });
      mountCounter();
      await act(async () => {});
      expect(screen.getByLabelText('Contador')).toHaveTextContent('0');

      await act(async () => document.dispatchEvent(new Event('visibilitychange')));

      expect(api.getUnreadNotificationCount).toHaveBeenCalledTimes(2);
      expect(screen.getByLabelText('Contador')).toHaveTextContent('4');
    });

    it('429 sem Retry-After suspende a consulta por 60 s', async () => {
      api.getUnreadNotificationCount
        .mockRejectedValueOnce(apiError(429))
        .mockResolvedValue({ unreadCount: 2 });
      mountCounter();
      await act(async () => {});

      await act(async () => vi.advanceTimersByTime(59_000));
      await act(async () => document.dispatchEvent(new Event('visibilitychange')));
      expect(api.getUnreadNotificationCount).toHaveBeenCalledTimes(1);

      await act(async () => vi.advanceTimersByTime(1_000));
      expect(api.getUnreadNotificationCount).toHaveBeenCalledTimes(2);
      expect(screen.getByLabelText('Contador')).toHaveTextContent('2');
    });
  });
});

describe('S2-02 bateria frontend — rótulos e mensagens de borda (NT-U-05)', () => {
  it.each([
    ['tipo desconhecido', () => notificationTypeLabel('OUTRO'), 'Notificação'],
    ['status desconhecido', () => taskStatusLabel('BLOQUEADO'), 'BLOQUEADO'],
    ['status ausente', () => taskStatusLabel(undefined), ''],
    ['instante ausente', () => formatInstant(''), ''],
    [
      'contexto de tipo desconhecido (painel, TF-REV-008)',
      () => notificationSentence({ type: 'OUTRO', context: null }),
      'Notificação sobre uma tarefa removida'
    ],
    ['nenhuma pendente', () => markAllMessage(0), 'Nenhuma notificação estava pendente.'],
    ['uma marcada', () => markAllMessage(1), '1 notificação marcada como lida.'],
    ['várias marcadas', () => markAllMessage(3), '3 notificações marcadas como lidas.'],
    ['contador negativo', () => unreadBadge(-2), null]
  ])('%s', (_, compute, expected) => {
    expect(compute()).toBe(expected);
  });
});

describe('S2-02 bateria frontend — contrato do módulo de API com as rotas do backend (NT-C)', () => {
  const routesFile = resolve('../backend/src/modules/notifications/notification.routes.js');
  const spies = [];
  let real;

  beforeAll(async () => {
    real = await vi.importActual('../../src/features/notifications/api/notifications.api.js');
  });
  beforeEach(() => {
    for (const method of ['get', 'post', 'patch', 'put'])
      spies.push(vi.spyOn(httpClient, method).mockResolvedValue({ data: { via: method } }));
  });
  afterEach(() => {
    while (spies.length) spies.pop().mockRestore();
  });

  it('cada função usa o método, o caminho e o corpo que a rota aceita', async () => {
    const signal = new AbortController().signal;

    await expect(
      real.listNotifications(
        { status: 'ALL', page: 2, limit: 20, extra: '' },
        { signal, fresh: true }
      )
    ).resolves.toEqual({ via: 'get' });
    expect(httpClient.get).toHaveBeenLastCalledWith('/notifications', {
      signal,
      fresh: true,
      params: { status: 'ALL', page: 2, limit: 20 }
    });
    await real.listNotifications();
    expect(httpClient.get).toHaveBeenLastCalledWith('/notifications', { params: {} });
    await real.getUnreadNotificationCount();
    expect(httpClient.get).toHaveBeenLastCalledWith('/notifications/unread-count', {});
    await real.markNotification(15, false);
    expect(httpClient.patch).toHaveBeenLastCalledWith('/notifications/15', { read: false });
    await real.markAllNotificationsRead();
    expect(httpClient.post).toHaveBeenLastCalledWith('/notifications/read-all', {});
    await real.getNotificationPreferences();
    expect(httpClient.get).toHaveBeenLastCalledWith('/settings/notifications', {});
    await real.saveNotificationPreferences({ TASK_OVERDUE: false });
    expect(httpClient.put).toHaveBeenLastCalledWith('/settings/notifications', {
      preferences: { TASK_OVERDUE: false }
    });
  });

  it('as seis rotas chamadas pelo frontend existem no backend com o mesmo método', () => {
    const routes = readFileSync(routesFile, 'utf8');
    for (const [method, path] of [
      ['get', '/notifications'],
      ['get', '/notifications/unread-count'],
      ['post', '/notifications/read-all'],
      ['patch', '/notifications/:notificationId'],
      ['get', '/settings/notifications'],
      ['put', '/settings/notifications']
    ])
      expect(routes).toMatch(new RegExp(`router\\.${method}\\(\\s*'${path}'`));
  });
});
