import { render, screen, waitFor } from '@testing-library/react';
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
const { ThemeProvider } = await import('../../../src/app/theme/ThemeProvider.jsx');
const { ProjectsCatalogProvider } = await import('../../../src/features/projects/index.js');
const { UnreadNotificationsProvider } =
  await import('../../../src/features/notifications/index.js');
const { useDialogLayer } = await import('../../../src/shared/components/dialog-stack.js');

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

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const focusables = () =>
  [...panel().querySelectorAll(FOCUSABLE)].filter(
    (element) => element.getAttribute('aria-hidden') !== 'true'
  );

describe('TF-REV-011 — contenção de foco do painel a partir do título', () => {
  it('P-01 Shift+Tab com o foco inicial no título vai ao último controle do painel', async () => {
    const user = userEvent.setup();
    renderShell();
    await openPanel(user);
    await screen.findAllByRole('button', { name: /^Marcar como lida/ });

    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Notificações' }));
    await user.tab({ shift: true });

    expect(panel().contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(focusables().at(-1));
  });

  it('P-02 Tab no último controle volta ao primeiro', async () => {
    const user = userEvent.setup();
    renderShell();
    await openPanel(user);
    focusables().at(-1).focus();

    await user.tab();

    expect(document.activeElement).toBe(focusables()[0]);
  });

  it('P-03 Escape fecha o painel e devolve o foco ao sino', async () => {
    const user = userEvent.setup();
    renderShell();
    await openPanel(user);

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Notificações' })).not.toBeInTheDocument()
    );
    expect(document.activeElement).toBe(bell());
  });
});
