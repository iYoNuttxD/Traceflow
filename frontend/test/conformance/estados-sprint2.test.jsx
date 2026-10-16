import { MemoryRouter, Route, Routes } from 'react-router';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../../src/shared/index.js';

const traceability = vi.hoisted(() => ({
  getTraceabilityAlerts: vi.fn(),
  getTraceabilityAlertSummary: vi.fn(),
  getTraceabilityAlert: vi.fn(),
  dismissTraceabilityAlert: vi.fn(),
  reconcileTraceabilityAlerts: vi.fn(),
  getTasksWithoutTechnicalLinks: vi.fn()
}));
const notifications = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  getUnreadNotificationCount: vi.fn(),
  markNotification: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  getNotificationPreferences: vi.fn(),
  saveNotificationPreferences: vi.fn()
}));
vi.mock('../../src/features/traceability/api/traceability.api.js', () => traceability);
vi.mock('../../src/features/notifications/api/notifications.api.js', () => notifications);
vi.mock('../../src/features/projects/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  ProjectSectionNav: () => <nav aria-label="Navegação do projeto" />
}));
vi.mock('../../src/features/projects/api/projects.api.js', () => ({
  projectsApi: { list: vi.fn().mockResolvedValue({ projects: [] }) }
}));

const { TraceabilityAlertsPage } = await import('../../src/pages/TraceabilityAlertsPage.jsx');
const { UnlinkedTasksPage } = await import('../../src/pages/UnlinkedTasksPage.jsx');
const { NotificationsPanel, UnreadNotificationsProvider } =
  await import('../../src/features/notifications/index.js');

function NotificationsPage() {
  return <NotificationsPanel onClose={() => {}} />;
}

const permissions = { canLink: true, canManage: true };
const summary = {
  projectId: 9,
  open: { total: 0, byType: {} },
  dismissed: { total: 0 },
  rules: { taskWithoutCommitActive: true },
  permissions
};
const emptyPage = { page: 1, limit: 20, total: 0, totalPages: 0 };

function failure(status, retryAfter) {
  const error = new Error('falha');
  error.response = {
    status,
    headers: retryAfter ? { 'retry-after': String(retryAfter) } : {},
    data: { code: `HTTP_${status}`, message: `Falha ${status} do servidor.` }
  };
  return error;
}

const pages = {
  alertas: {
    path: '/projects/9/traceability/alerts',
    route: '/projects/:projectId/traceability/alerts',
    element: <TraceabilityAlertsPage />,
    arrange(load) {
      traceability.getTraceabilityAlertSummary.mockResolvedValue(summary);
      traceability.getTraceabilityAlerts.mockImplementation(
        load ??
          (() =>
            Promise.resolve({
              projectId: 9,
              status: 'OPEN',
              type: null,
              alerts: [],
              pagination: emptyPage,
              permissions
            }))
      );
    }
  },
  tarefasSemVinculo: {
    path: '/projects/9/traceability/unlinked-tasks',
    route: '/projects/:projectId/traceability/unlinked-tasks',
    element: <UnlinkedTasksPage />,
    arrange(load) {
      traceability.getTraceabilityAlertSummary.mockResolvedValue(summary);
      traceability.getTasksWithoutTechnicalLinks.mockImplementation(
        load ??
          (() => Promise.resolve({ projectId: 9, tasks: [], pagination: emptyPage, permissions }))
      );
    }
  },
  notificacoes: {
    path: '/notifications',
    route: '/notifications',
    element: <NotificationsPage />,
    arrange(load) {
      notifications.getUnreadNotificationCount.mockResolvedValue({ unreadCount: 0 });
      notifications.listNotifications.mockImplementation(
        load ??
          (() => Promise.resolve({ notifications: [], pagination: emptyPage, unreadCount: 0 }))
      );
    }
  }
};

function renderPage(page) {
  return render(
    <ConfirmProvider>
      <MemoryRouter initialEntries={[page.path]}>
        <UnreadNotificationsProvider>
          <Routes>
            <Route path={page.route} element={page.element} />
          </Routes>
        </UnreadNotificationsProvider>
      </MemoryRouter>
    </ConfirmProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('H38 — estados das telas da Sprint 2', () => {
  for (const [name, page] of Object.entries(pages)) {
    it.each([500, 403, 404, 409, 503])(
      `${name}: erro %i mostra alerta e nova tentativa`,
      async (status) => {
        page.arrange(() => Promise.reject(failure(status, status === 503 ? 2 : undefined)));
        renderPage(page);
        expect(await screen.findByRole('alert')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Tentar novamente/ })).toBeInTheDocument();
      }
    );

    it(`${name}: 429 bloqueia a nova tentativa durante a espera`, async () => {
      page.arrange(() => Promise.reject(failure(429, 30)));
      renderPage(page);
      expect(
        await screen.findByRole('button', { name: /Tentar novamente em \d+s/ })
      ).toBeInTheDocument();
    });

    it(`${name}: carregando e vazio não mostram alerta`, async () => {
      page.arrange(() => new Promise(() => {}));
      renderPage(page);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(screen.queryByRole('alert')).toBeNull();
      cleanup();
      page.arrange(null);
      renderPage(page);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(screen.queryByRole('alert')).toBeNull();
    });
  }

  it('alertas: com filtro ativo, "Limpar filtros" aparece uma vez', async () => {
    const user = userEvent.setup();
    pages.alertas.arrange(null);
    renderPage(pages.alertas);
    await user.click(await screen.findByRole('button', { name: /Buscar e filtrar/ }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Situação' }), 'DISMISSED');
    expect(await screen.findAllByRole('button', { name: /Limpar filtros/ })).toHaveLength(1);
  });
});
