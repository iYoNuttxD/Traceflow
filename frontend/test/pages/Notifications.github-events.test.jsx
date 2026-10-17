import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
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
  NotificationPreferencesPage,
  NotificationsPanel,
  UnreadNotificationsProvider
} from '../../src/features/notifications/index.js';
import { formatInstant } from '../../src/features/notifications/model/notification-view.js';

const OCCURRED = '2026-10-12T13:03:00.000Z';
const CREATED = '2026-10-12T14:00:00.000Z';
const ISSUE_URL = 'https://github.com/usuario-s203/repositorio-s203/issues/45';
const PR_URL = 'https://github.com/usuario-s203/repositorio-s203/pull/8';
const closePanel = () => {};

function NotificationsPage() {
  return <NotificationsPanel onClose={closePanel} />;
}

function githubNotification(id, overrides = {}) {
  const { context = {}, ...rest } = overrides;
  return {
    id,
    type: 'ISSUE_EVENT',
    createdAt: CREATED,
    readAt: null,
    project: { id: 9, name: 'Projeto Escala' },
    task: { id: 100 + id, code: `TASK-${100 + id}`, title: `Tarefa ${id}`, available: true },
    context: {
      event: 'ISSUE_CLOSED',
      occurredAt: OCCURRED,
      artifact: { kind: 'ISSUE', number: 45, title: 'Corrigir login', url: ISSUE_URL },
      ...context
    },
    link: `/projects/9/kanban?task=${100 + id}`,
    ...rest
  };
}

const pullRequest = (id, event, overrides = {}) =>
  githubNotification(id, {
    type: 'PULL_REQUEST_EVENT',
    context: {
      event,
      artifact: { kind: 'PULL_REQUEST', number: 8, title: 'Ajusta a sincronização', url: PR_URL }
    },
    ...overrides
  });

function listing(items) {
  return {
    notifications: items,
    pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 },
    unreadCount: items.filter((item) => !item.readAt).length,
    nextCursor: null
  };
}

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Destino">{`${location.pathname}${location.search}`}</output>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/notifications']}>
      <UnreadNotificationsProvider>
        <Routes>
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/projects/:projectId/kanban" element={<LocationProbe />} />
          <Route path="/settings/notifications" element={<NotificationPreferencesPage />} />
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

describe('S2-03 central: eventos de issue e pull request (D13)', () => {
  it('F1 o aviso da issue fechada mostra a frase com a tarefa, o horário e um único link, para a tarefa (painel, TF-REV-008)', async () => {
    api.listNotifications.mockResolvedValue(listing([githubNotification(1)]));
    renderPage();

    const card = await waitFor(() => cardOf('TASK-101'));
    expect(card).toHaveAccessibleName(
      `Issue: Issue #45 fechada no GitHub · TASK-101. Projeto Escala, ${formatInstant(CREATED)}`
    );
    expect(within(card).getByText('Issue #45 fechada no GitHub · TASK-101')).toBeInTheDocument();
    expect(within(card).getByText(/Projeto Escala/)).toBeInTheDocument();
    expect(card.querySelector('time')).toHaveAttribute('datetime', CREATED);
    expect(card.querySelector('time')).toHaveTextContent(formatInstant(CREATED));
    expect(
      within(card).getByRole('link', { name: /Issue #45 fechada no GitHub · TASK-101/ })
    ).toHaveAttribute('href', '/projects/9/kanban?task=101');
    expect(within(card).getAllByRole('link')).toHaveLength(1);
    expect(within(card).queryByRole('link', { name: /Abrir no GitHub/ })).not.toBeInTheDocument();
    expect(card.querySelector(`a[href="${ISSUE_URL}"]`)).toBeNull();
    expect(card.querySelector('a[target="_blank"]')).toBeNull();
  });

  it('F2 os outros três eventos têm texto próprio; evento desconhecido não quebra o cartão (painel, TF-REV-008)', async () => {
    api.listNotifications.mockResolvedValue(
      listing([
        githubNotification(1, { context: { event: 'ISSUE_REOPENED' } }),
        pullRequest(2, 'PULL_REQUEST_MERGED'),
        pullRequest(3, 'PULL_REQUEST_CLOSED'),
        githubNotification(4, { context: { event: 'ISSUE_TRANSFERRED' } })
      ])
    );
    renderPage();

    await waitFor(() => cardOf('TASK-101'));
    expect(
      within(cardOf('TASK-101')).getByText('Issue #45 reaberta no GitHub · TASK-101')
    ).toBeInTheDocument();
    expect(
      within(cardOf('TASK-102')).getByText('PR #8 mesclada no GitHub · TASK-102')
    ).toBeInTheDocument();
    expect(
      within(cardOf('TASK-103')).getByText('PR #8 fechada sem merge no GitHub · TASK-103')
    ).toBeInTheDocument();
    expect(cardOf('TASK-102')).toHaveAccessibleName(/^Pull request: /);
    expect(
      within(cardOf('TASK-102')).queryByRole('link', { name: /Abrir no GitHub/ })
    ).not.toBeInTheDocument();
    expect(within(cardOf('TASK-102')).getByRole('link')).toHaveAttribute(
      'href',
      '/projects/9/kanban?task=102'
    );
    expect(document.body.querySelector(`a[href="${PR_URL}"]`)).toBeNull();
    expect(
      within(cardOf('TASK-104')).getByText('Issue #45 mudou no GitHub · TASK-104')
    ).toBeInTheDocument();
  });

  it('F3 título vindo do GitHub com HTML não entra no aviso nem vira HTML (painel, TF-REV-008)', async () => {
    const hostile = '<img src=x onerror="window.__s203=1">';
    api.listNotifications.mockResolvedValue(
      listing([
        githubNotification(1, {
          context: { artifact: { kind: 'ISSUE', number: 45, title: hostile, url: ISSUE_URL } }
        })
      ])
    );
    renderPage();

    await waitFor(() => cardOf('TASK-101'));
    expect(cardOf('TASK-101')).toHaveAccessibleName(
      `Issue: Issue #45 fechada no GitHub · TASK-101. Projeto Escala, ${formatInstant(CREATED)}`
    );
    expect(cardOf('TASK-101')).not.toHaveTextContent(hostile);
    expect(document.body.querySelector('img')).toBeNull();
    expect(window.__s203).toBeUndefined();
  });

  it('F4 sem URL o aviso só leva à tarefa; com a tarefa excluída, o aviso abre o GitHub em nova aba e marca como lida (painel, TF-REV-008)', async () => {
    const user = userEvent.setup();
    api.markNotification.mockResolvedValue({
      notification: githubNotification(2, {
        task: { id: null, code: null, title: 'Tarefa apagada', available: false },
        link: null,
        readAt: '2026-10-12T15:00:00.000Z'
      })
    });
    api.listNotifications.mockResolvedValue(
      listing([
        githubNotification(1, {
          context: { artifact: { kind: 'ISSUE', number: 45, title: 'Sem link', url: null } }
        }),
        githubNotification(2, {
          task: { id: null, code: null, title: 'Tarefa apagada', available: false },
          link: null
        })
      ])
    );
    renderPage();

    await waitFor(() => cardOf('TASK-101'));
    expect(within(cardOf('TASK-101')).getByRole('link')).toHaveAttribute(
      'href',
      '/projects/9/kanban?task=101'
    );
    expect(cardOf('TASK-101').querySelector('a[target="_blank"]')).toBeNull();
    const orphan = screen.getByRole('article', { name: /Tarefa apagada/ });
    expect(
      within(orphan).getByText('Issue #45 fechada no GitHub · “Tarefa apagada”')
    ).toBeInTheDocument();
    const external = within(orphan).getByRole('link');
    expect(external).toHaveAttribute('href', ISSUE_URL);
    expect(external).toHaveAttribute('target', '_blank');
    expect(external).toHaveAttribute('rel', 'noopener noreferrer');
    expect(external).toHaveTextContent('· Tarefa excluída · abre no GitHub em nova aba');

    const stopNavigation = (event) => event.preventDefault();
    document.addEventListener('click', stopNavigation, true);
    await user.click(external);
    document.removeEventListener('click', stopNavigation, true);

    expect(api.markNotification).toHaveBeenCalledWith(2, true);
    expect(screen.getByRole('dialog', { name: 'Notificações' })).toBeInTheDocument();
    expect(
      await within(orphan).findByRole('button', { name: /^Marcar como não lida: / })
    ).toBeInTheDocument();
  });

  it('F6 a ordem de foco vai do link do aviso para marcar como lida (painel, TF-REV-008)', async () => {
    const user = userEvent.setup();
    api.listNotifications.mockResolvedValue(listing([githubNotification(1)]));
    renderPage();
    const card = await waitFor(() => cardOf('TASK-101'));

    within(card)
      .getByRole('link', { name: /Issue #45 fechada no GitHub · TASK-101/ })
      .focus();
    await user.tab();
    expect(
      within(card).getByRole('button', {
        name: `Marcar como lida: Issue #45 fechada no GitHub · TASK-101, Projeto Escala, ${formatInstant(CREATED)}`
      })
    ).toHaveFocus();
  });

  it('F7 F8 tipos misturados: marca como lida e não guarda nada no navegador (painel, TF-REV-008)', async () => {
    const user = userEvent.setup();
    const items = [
      githubNotification(1),
      pullRequest(2, 'PULL_REQUEST_MERGED'),
      githubNotification(3, {
        type: 'TASK_STATUS_CHANGED',
        context: {
          fromStatus: 'A_FAZER',
          toStatus: 'EM_ANDAMENTO',
          actor: { id: 3, name: 'Ana Souza' }
        }
      })
    ];
    api.listNotifications.mockResolvedValue(listing(items));
    api.markNotification.mockResolvedValue({
      notification: { ...items[1], readAt: '2026-10-12T15:00:00.000Z' }
    });
    renderPage();
    await waitFor(() => cardOf('TASK-102'));

    await user.click(within(cardOf('TASK-102')).getByRole('button', { name: /Marcar como lida/ }));

    expect(api.markNotification).toHaveBeenCalledWith(2, true);
    await waitFor(() =>
      expect(
        within(cardOf('TASK-102')).getByRole('button', { name: /Marcar como não lida/ })
      ).toBeInTheDocument()
    );
    expect(
      within(cardOf('TASK-103')).getByText('Ana Souza moveu TASK-103 para Em andamento')
    ).toBeInTheDocument();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('F9 o painel não tem texto de abertura; as preferências descrevem os avisos de tarefa e os do GitHub com seus destinatários (painel, TF-REV-008)', async () => {
    const user = userEvent.setup();
    api.listNotifications.mockResolvedValue(listing([githubNotification(1)]));
    api.getNotificationPreferences.mockResolvedValue({
      preferences: {
        TASK_STATUS_CHANGED: true,
        TASK_OVERDUE: true,
        ISSUE_EVENT: true,
        PULL_REQUEST_EVENT: true,
        TRACEABILITY_INCONSISTENCY: true
      }
    });
    renderPage();

    const panel = await screen.findByRole('dialog', { name: 'Notificações' });
    expect(
      within(panel).getByRole('heading', { level: 2, name: 'Notificações' })
    ).toBeInTheDocument();
    expect(within(panel).queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    const preferences = within(panel).getByRole('link', { name: 'Preferências de notificação' });
    expect(preferences).toHaveAttribute('href', '/settings/notifications');

    await user.click(preferences);

    const taskNotices = await screen.findByRole('group', { name: 'Avisos sobre as suas tarefas' });
    expect(taskNotices).toHaveTextContent(
      'Avisa quando muda o status de uma tarefa da qual você é responsável'
    );
    expect(taskNotices).toHaveTextContent(
      'Avisa uma vez quando uma tarefa da qual você é responsável passa do prazo'
    );
    const githubNotices = screen.getByRole('group', { name: 'Avisos do GitHub' });
    expect(githubNotices).toHaveTextContent(
      'issue aberta é vinculada a uma tarefa da qual você é responsável, em que comentou ou registrou esforço, e quando essa issue é fechada ou reaberta no GitHub'
    );
    expect(githubNotices).toHaveTextContent(
      'pull request vinculada a uma tarefa da qual você é responsável, em que comentou ou registrou esforço é mesclada ou fechada sem merge no GitHub'
    );
  });
});
