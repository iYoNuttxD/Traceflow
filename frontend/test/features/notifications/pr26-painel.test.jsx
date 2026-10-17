import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  getUnreadNotificationCount: vi.fn(),
  markNotification: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  getNotificationPreferences: vi.fn(),
  saveNotificationPreferences: vi.fn()
}));
const projects = vi.hoisted(() => ({ list: vi.fn() }));
const USER = vi.hoisted(() => ({
  id: 7,
  name: 'Ana Souza',
  email: 'ana@example.invalid',
  accountStatus: 'ACTIVE',
  emailVerifiedAt: '2026-10-01T12:00:00.000Z'
}));
vi.mock('../../../src/features/notifications/api/notifications.api.js', () => api);
vi.mock('../../../src/features/projects/api/projects.api.js', () => ({
  projectsApi: { list: projects.list }
}));
vi.mock('../../../src/features/auth/AuthContext.jsx', () => ({
  useAuth: () => ({
    user: USER,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    updateUser: vi.fn(),
    refresh: vi.fn()
  })
}));

const { AppShell } = await import('../../../src/app/layout/AppShell.jsx');
const { AppRoutes } = await import('../../../src/app/routes/AppRoutes.jsx');
const { ThemeProvider } = await import('../../../src/app/theme/ThemeProvider.jsx');
const { ProjectsCatalogProvider } = await import('../../../src/features/projects/index.js');
const { UnreadNotificationsProvider } =
  await import('../../../src/features/notifications/index.js');
const { useDialogLayer } = await import('../../../src/shared/components/dialog-stack.js');
const { ConfirmProvider } = await import('../../../src/shared/index.js');
const { formatInstant } =
  await import('../../../src/features/notifications/model/notification-view.js');

const CREATED = '2026-10-15T14:30:00.000Z';

function notification(id, overrides = {}) {
  return {
    id,
    type: 'TASK_STATUS_CHANGED',
    createdAt: CREATED,
    readAt: null,
    project: { id: 9, name: 'Projeto Alfa' },
    task: { id: 100 + id, code: `TASK-${100 + id}`, title: `Tarefa ${id}`, available: true },
    context: {
      fromStatus: 'EM_ANDAMENTO',
      toStatus: 'CONCLUIDO',
      actor: { id: 3, name: 'Bruno Lima' },
      selfAction: false
    },
    link: `/projects/9/kanban?task=${100 + id}`,
    ...overrides
  };
}

function listing(items, { total = items.length, nextCursor = null, unreadCount } = {}) {
  return {
    notifications: items,
    pagination: { page: 1, limit: 20, total, totalPages: Math.ceil(total / 20) },
    unreadCount: unreadCount ?? items.filter((item) => !item.readAt).length,
    nextCursor
  };
}

function apiError(status, { message = 'falha', retryAfter } = {}) {
  const error = new Error(message);
  error.response = {
    status,
    data: { message },
    headers: retryAfter ? { 'retry-after': String(retryAfter) } : {}
  };
  return error;
}

function mockViewport({ mobile = false } = {}) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query === '(max-width: 720px)' && mobile,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }));
}

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Destino">{`${location.pathname}${location.search}`}</output>;
}

let openStacked;
function StackedLayer({ onClose }) {
  const isTop = useDialogLayer(true);
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key !== 'Escape' || !isTop()) return;
      event.preventDefault();
      onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isTop, onClose]);
  return <div role="dialog" aria-label="Diálogo empilhado" />;
}
function StackedHost() {
  const [open, setOpen] = useState(false);
  openStacked = setOpen;
  return open ? <StackedLayer onClose={() => setOpen(false)} /> : null;
}

function renderShell({ route = '/projects' } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ThemeProvider>
        <ProjectsCatalogProvider>
          <UnreadNotificationsProvider>
            <AppShell user={USER} onLogout={vi.fn()}>
              <Routes>
                <Route path="/projects" element={<p>Página de projetos</p>} />
                <Route path="/projects/:projectId/kanban" element={<LocationProbe />} />
                <Route path="/settings/notifications" element={<LocationProbe />} />
              </Routes>
            </AppShell>
            <StackedHost />
          </UnreadNotificationsProvider>
        </ProjectsCatalogProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
}

const panel = () => screen.getByRole('dialog', { name: 'Notificações' });
const bell = () => screen.getAllByRole('button', { name: /^Notificações/ })[0];

async function openPanel(user) {
  await user.click(bell());
  await screen.findByRole('dialog', { name: 'Notificações' });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  mockViewport();
  projects.list.mockResolvedValue({ data: { projects: [] } });
  api.getUnreadNotificationCount.mockResolvedValue({ unreadCount: 2 });
  api.listNotifications.mockResolvedValue(listing([notification(1), notification(2)]));
  api.markNotification.mockImplementation(async (id, read) => ({
    notification: notification(id, { readAt: read ? CREATED : null })
  }));
});

describe('PR #26 painel de notificações (TF-REV-008, UX-D01)', () => {
  it('P-01 o sino abre o painel em diálogo, com a casca inerte e o contador único', async () => {
    const user = userEvent.setup();
    renderShell();
    await waitFor(() => expect(bell()).toHaveAccessibleName('Notificações, 2 não lidas'));
    expect(bell()).toHaveAttribute('aria-haspopup', 'dialog');
    expect(bell()).toHaveAttribute('aria-expanded', 'false');

    await openPanel(user);

    expect(panel()).toHaveAttribute('aria-modal', 'true');
    expect(document.querySelector('.trace-shell').inert).toBe(true);
    expect(await within(panel()).findAllByRole('article')).toHaveLength(2);
    expect(within(panel()).getByRole('tab', { name: /Não lidas/ })).toHaveTextContent('2');
    expect(screen.queryByText(/Avisos sobre as suas tarefas/)).not.toBeInTheDocument();
  });

  it('P-02 o foco vai ao título; fechar pelo botão ou por Escape devolve o foco ao sino', async () => {
    const user = userEvent.setup();
    renderShell();
    await openPanel(user);

    expect(within(panel()).getByRole('heading', { name: 'Notificações' })).toHaveFocus();
    await user.click(within(panel()).getByRole('button', { name: 'Fechar notificações' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notificações' })).toBeNull());
    await waitFor(() => expect(bell()).toHaveFocus());
    expect(document.querySelector('.trace-shell').inert).toBe(false);

    await openPanel(user);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(bell()).toHaveFocus());
  });

  it('P-03 com um diálogo empilhado, Escape fecha só o de cima', async () => {
    const user = userEvent.setup();
    renderShell();
    await openPanel(user);
    act(() => openStacked(true));

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Diálogo empilhado' })).toBeNull();
    expect(panel()).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notificações' })).toBeNull());
  });

  it('P-04 Tab e Shift+Tab ficam dentro do painel', async () => {
    const user = userEvent.setup();
    renderShell();
    await openPanel(user);
    await within(panel()).findAllByRole('article');
    const focusable = [
      ...panel().querySelectorAll('a[href], button:not([disabled]), select, [tabindex="0"]')
    ];
    const last = focusable.at(-1);

    last.focus();
    await user.tab();
    expect(focusable[0]).toHaveFocus();
    await user.tab({ shift: true });
    expect(last).toHaveFocus();
  });

  it('P-05 as abas trocam por setas, Home e End, e recarregam a lista', async () => {
    const user = userEvent.setup();
    renderShell();
    await openPanel(user);
    const unread = within(panel()).getByRole('tab', { name: /Não lidas/ });
    unread.focus();

    await user.keyboard('{ArrowRight}');
    const all = within(panel()).getByRole('tab', { name: 'Todas' });
    expect(all).toHaveFocus();
    expect(all).toHaveAttribute('aria-selected', 'true');
    await waitFor(() =>
      expect(api.listNotifications).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'ALL' }),
        expect.anything()
      )
    );
    await user.keyboard('{Home}');
    expect(unread).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{End}');
    expect(all).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(unread).toHaveFocus();
    expect(within(panel()).getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      'notifications-tab-UNREAD'
    );
  });

  it('P-06 a origem filtra pela API e o vazio diz qual origem', async () => {
    const user = userEvent.setup();
    renderShell();
    await openPanel(user);
    await within(panel()).findAllByRole('article');
    api.listNotifications.mockResolvedValue(listing([]));

    await user.selectOptions(within(panel()).getByRole('combobox', { name: 'Origem' }), 'GITHUB');

    expect(
      await within(panel()).findByText('Nenhuma notificação do GitHub não lida.')
    ).toBeInTheDocument();
    expect(api.listNotifications).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'UNREAD', group: 'GITHUB' }),
      expect.anything()
    );
    expect(
      within(panel())
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual(['Todas', 'Tarefas', 'GitHub', 'Inconsistências']);
  });

  it('P-07 o item inteiro abre o contexto, marca como lida e fecha o painel', async () => {
    const user = userEvent.setup();
    renderShell();
    await openPanel(user);
    const [first] = await within(panel()).findAllByRole('article');

    await user.click(within(first).getByRole('link', { name: /Bruno Lima moveu TASK-101/ }));

    expect(await screen.findByLabelText('Destino')).toHaveTextContent(
      '/projects/9/kanban?task=101'
    );
    expect(api.markNotification).toHaveBeenCalledWith(1, true);
    expect(screen.queryByRole('dialog', { name: 'Notificações' })).toBeNull();
    expect(bell()).not.toHaveFocus();
  });

  it('P-08 a frase é compacta, por tipo, e o botão de 44 px alterna a leitura com o contexto no nome', async () => {
    const user = userEvent.setup();
    api.listNotifications.mockResolvedValue(
      listing([
        notification(1),
        notification(2, { type: 'TASK_OVERDUE', context: { dueDate: '2026-10-14' } }),
        notification(3, {
          type: 'ISSUE_EVENT',
          context: {
            event: 'ISSUE_CLOSED',
            occurredAt: CREATED,
            artifact: { kind: 'ISSUE', number: 45, title: 'Erro', url: null }
          }
        }),
        notification(4, {
          type: 'TRACEABILITY_INCONSISTENCY',
          task: null,
          link: '/projects/9/repository?alerta=12',
          context: {
            occurredAt: CREATED,
            artifact: { kind: 'PULL_REQUEST', number: 8, title: 'Ajusta login', url: null },
            alert: { id: 12, type: 'PULL_REQUEST_MERGED_WITHOUT_TASK', status: 'OPEN' },
            batch: null
          }
        }),
        notification(5, { context: { toStatus: 'A_FAZER', actor: null, selfAction: true } })
      ])
    );
    renderShell();
    await openPanel(user);
    const items = await within(panel()).findAllByRole('article');

    expect(
      items.map((item) => item.querySelector('.notification-item__sentence').textContent)
    ).toEqual([
      'Não lida: Bruno Lima moveu TASK-101 para Concluído',
      'Não lida: TASK-102 venceu em 14/10/2026',
      'Não lida: Issue #45 fechada no GitHub · TASK-103',
      'Não lida: PR #8 mesclada sem tarefa vinculada',
      'Não lida: Você moveu TASK-105 para A fazer'
    ]);
    expect(items.map((item) => item.querySelector('.notification-item__icon').className)).toEqual([
      expect.stringContaining('--info'),
      expect.stringContaining('--danger'),
      expect.stringContaining('--info'),
      expect.stringContaining('--warning'),
      expect.stringContaining('--info')
    ]);
    expect(items[3]).toHaveTextContent('Projeto Alfa');
    expect(items[3]).toHaveTextContent('em aberto');
    expect(items[0].querySelector('time')).toHaveAttribute('datetime', CREATED);

    const toggle = within(items[0]).getByRole('button', {
      name: `Marcar como lida: Bruno Lima moveu TASK-101 para Concluído, Projeto Alfa, ${formatInstant(CREATED)}`
    });
    await user.click(toggle);
    expect(api.markNotification).toHaveBeenCalledWith(1, true);
    expect(
      await within(panel()).findByRole('button', { name: /^Marcar como não lida: Bruno Lima/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Abrir no GitHub/ })).toBeNull();
  });

  it('P-09 vazio com "Ver todas", carregando, erro com nova tentativa e limite de taxa', async () => {
    const user = userEvent.setup();
    let resolveList;
    api.listNotifications.mockImplementationOnce(
      () => new Promise((resolve) => (resolveList = resolve))
    );
    renderShell();
    await openPanel(user);

    expect(within(panel()).getByText('Carregando notificações...')).toBeInTheDocument();
    await act(async () => resolveList(listing([], { unreadCount: 0 })));
    expect(within(panel()).getByText('Nenhuma notificação não lida.')).toBeInTheDocument();
    expect(
      within(panel()).getByRole('button', { name: 'Marcar todas como lidas' })
    ).toHaveAttribute('aria-disabled', 'true');

    api.listNotifications.mockRejectedValueOnce(apiError(500, { message: 'Falhou.' }));
    await user.click(within(panel()).getByRole('button', { name: 'Ver todas' }));
    expect(
      await within(panel()).findByRole('button', { name: 'Tentar novamente' })
    ).toBeInTheDocument();
    expect(within(panel()).getByRole('tab', { name: 'Todas' })).toHaveAttribute(
      'aria-selected',
      'true'
    );

    api.listNotifications.mockRejectedValueOnce(
      apiError(429, { message: 'Muitas consultas.', retryAfter: 30 })
    );
    await user.click(within(panel()).getByRole('button', { name: 'Tentar novamente' }));
    expect(await within(panel()).findByText(/Muitas consultas/)).toBeInTheDocument();
    expect(
      within(panel()).getByRole('button', { name: /Tentar novamente em \d+s/ })
    ).toBeInTheDocument();
  });

  it('P-10 "Carregar mais" diz quantas faltam e segue o cursor', async () => {
    const user = userEvent.setup();
    const first = Array.from({ length: 20 }, (_, index) => notification(index + 1));
    api.listNotifications
      .mockResolvedValueOnce(listing(first, { total: 45, nextCursor: 'cursor-1' }))
      .mockResolvedValueOnce(
        listing([notification(21), notification(22)], { total: 45, nextCursor: 'cursor-2' })
      );
    renderShell();
    await openPanel(user);
    await within(panel()).findAllByRole('article');

    await user.click(within(panel()).getByRole('button', { name: 'Carregar mais (25 restantes)' }));

    await waitFor(() => expect(within(panel()).getAllByRole('article')).toHaveLength(22));
    expect(api.listNotifications).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 'cursor-1' }),
      expect.anything()
    );
    expect(
      within(panel()).getByRole('button', { name: 'Carregar mais (23 restantes)' })
    ).toBeEnabled();
  });

  it('P-11 no celular, o sino da barra e o da gaveta abrem o painel em tela cheia', async () => {
    mockViewport({ mobile: true });
    const user = userEvent.setup();
    renderShell();
    const topBell = document.querySelector('.trace-shell__mobile-actions [aria-haspopup="dialog"]');
    await waitFor(() => expect(topBell).toHaveAccessibleName('Notificações, 2 não lidas'));
    expect(topBell.querySelector('.trace-shell__menu-dot')).not.toBeNull();
    const menu = document.querySelector('[aria-controls="traceflow-global-navigation"]');
    expect(menu).toHaveAccessibleName('Abrir navegação');

    await user.click(menu);
    const sidebar = document.getElementById('traceflow-global-navigation');
    await user.click(within(sidebar).getByRole('button', { name: /^Notificações/ }));

    await screen.findByRole('dialog', { name: 'Notificações' });
    expect(document.querySelector('.trace-shell')).toHaveAttribute('data-drawer-state', 'closed');
    await waitFor(() =>
      expect(within(panel()).getByRole('heading', { name: 'Notificações' })).toHaveFocus()
    );
    await user.keyboard('{Escape}');
    await waitFor(() => expect(topBell).toHaveFocus());

    await user.click(topBell);
    expect(await screen.findByRole('dialog', { name: 'Notificações' })).toBeInTheDocument();
  });

  it('P-12 a rota antiga /notifications leva aos projetos com o painel aberto', async () => {
    projects.list.mockResolvedValue({ data: { projects: [{ id: 9, name: 'Projeto Alfa' }] } });
    render(
      <MemoryRouter initialEntries={['/notifications']}>
        <ThemeProvider>
          <ConfirmProvider>
            <AppRoutes />
          </ConfirmProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    expect(await screen.findByRole('dialog', { name: 'Notificações' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notificações' })).toBeNull());
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
  });
});
