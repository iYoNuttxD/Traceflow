import { MemoryRouter, Route, Routes } from 'react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../../src/shared/index.js';

const traceability = vi.hoisted(() => ({
  getTraceabilityAlerts: vi.fn(),
  getTraceabilityAlertSummary: vi.fn(),
  getTraceabilityAlert: vi.fn(),
  dismissTraceabilityAlert: vi.fn(),
  reconcileTraceabilityAlerts: vi.fn()
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

const { InconsistencySummary } =
  await import('../../src/features/traceability/components/InconsistencySummary.jsx');
const { AlertDetails } =
  await import('../../src/features/traceability/components/AlertDetails.jsx');
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

const inconsistency = {
  id: 12,
  type: 'PULL_REQUEST_MERGED_WITHOUT_TASK',
  status: 'OPEN',
  occurredAt: '2026-10-05T17:32:00.000Z',
  detectedAt: '2026-10-05T17:33:00.000Z',
  resolvedAt: null,
  resolutionReason: null,
  dismissal: null,
  limitations: [],
  subject: {
    type: 'PULL_REQUEST',
    id: 70,
    code: 'PR #45',
    title: 'Ajusta CI',
    available: true,
    githubUrl: null
  },
  context: null
};

const pages = {
  resumoDeInconsistencias: {
    path: '/projects/9/traceability',
    route: '/projects/:projectId/traceability',
    element: <InconsistencySummary projectId="9" />,
    arrange(load) {
      traceability.getTraceabilityAlertSummary.mockImplementation(
        load ?? (() => Promise.resolve(summary))
      );
    }
  },
  detalheDeInconsistencia: {
    path: '/projects/9/repository',
    route: '/projects/:projectId/repository',
    element: <AlertDetails projectId="9" alertId={12} />,
    arrange(load) {
      traceability.getTraceabilityAlerts.mockResolvedValue({
        alerts: [],
        pagination: emptyPage,
        permissions
      });
      traceability.getTraceabilityAlert.mockImplementation(
        load ?? (() => Promise.resolve({ alert: inconsistency, permissions }))
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
});
