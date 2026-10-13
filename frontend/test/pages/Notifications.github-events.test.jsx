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

import { NotificationsPage } from '../../src/pages/NotificationsPage.jsx';
import { UnreadNotificationsProvider } from '../../src/features/notifications/index.js';
import { formatInstant } from '../../src/features/notifications/model/notification-view.js';

const OCCURRED = '2026-10-12T13:03:00.000Z';
const ISSUE_URL = 'https://github.com/usuario-s203/repositorio-s203/issues/45';
const PR_URL = 'https://github.com/usuario-s203/repositorio-s203/pull/8';

function githubNotification(id, overrides = {}) {
  const { context = {}, ...rest } = overrides;
  return {
    id,
    type: 'ISSUE_EVENT',
    createdAt: '2026-10-12T14:00:00.000Z',
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
  it('F1 o cartão da issue fechada mostra evento, data, artefato, tarefa e os dois links', async () => {
    api.listNotifications.mockResolvedValue(listing([githubNotification(1)]));
    renderPage();

    const card = await waitFor(() => cardOf('TASK-101'));
    expect(card).toHaveAccessibleName('Issue: TASK-101 Tarefa 1');
    expect(within(card).getByText('Issue')).toBeInTheDocument();
    expect(
      within(card).getByText(`Issue #45 fechada no GitHub em ${formatInstant(OCCURRED)}`)
    ).toBeInTheDocument();
    expect(within(card).getByText('Corrigir login')).toBeInTheDocument();
    expect(within(card).getByText('Tarefa 1')).toBeInTheDocument();
    expect(within(card).getByText(/Projeto Escala/)).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Abrir tarefa TASK-101' })).toHaveAttribute(
      'href',
      '/projects/9/kanban?task=101'
    );
    const external = within(card).getByRole('link', {
      name: 'Abrir no GitHub a issue #45 (abre em nova aba)'
    });
    expect(external).toHaveAttribute('href', ISSUE_URL);
    expect(external).toHaveAttribute('target', '_blank');
    expect(external).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('F2 os outros três eventos têm texto próprio; evento desconhecido não quebra o cartão', async () => {
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
    const when = formatInstant(OCCURRED);
    expect(
      within(cardOf('TASK-101')).getByText(`Issue #45 reaberta no GitHub em ${when}`)
    ).toBeInTheDocument();
    expect(
      within(cardOf('TASK-102')).getByText(`Pull request #8 mesclada no GitHub em ${when}`)
    ).toBeInTheDocument();
    expect(
      within(cardOf('TASK-103')).getByText(`Pull request #8 fechada sem merge no GitHub em ${when}`)
    ).toBeInTheDocument();
    expect(within(cardOf('TASK-102')).getByText('Pull request')).toBeInTheDocument();
    expect(
      within(cardOf('TASK-102')).getByRole('link', {
        name: 'Abrir no GitHub a pull request #8 (abre em nova aba)'
      })
    ).toHaveAttribute('href', PR_URL);
    expect(
      within(cardOf('TASK-104')).getByText(`Issue #45 mudou no GitHub em ${when}`)
    ).toBeInTheDocument();
  });

  it('F3 título vindo do GitHub com HTML aparece como texto', async () => {
    const hostile = '<img src=x onerror="window.__s203=1">';
    api.listNotifications.mockResolvedValue(
      listing([
        githubNotification(1, {
          context: { artifact: { kind: 'ISSUE', number: 45, title: hostile, url: ISSUE_URL } }
        })
      ])
    );
    const { container } = renderPage();

    await waitFor(() => cardOf('TASK-101'));
    expect(within(cardOf('TASK-101')).getByText(hostile)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(window.__s203).toBeUndefined();
  });

  it('F4 sem URL não há botão do GitHub; tarefa excluída mantém o botão do GitHub', async () => {
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
    expect(
      within(cardOf('TASK-101')).queryByRole('link', { name: /Abrir no GitHub/ })
    ).not.toBeInTheDocument();
    const orphan = screen.getByRole('article', { name: /Tarefa apagada/ });
    expect(within(orphan).getByText('Tarefa excluída')).toBeInTheDocument();
    expect(within(orphan).queryByRole('link', { name: /Abrir tarefa/ })).not.toBeInTheDocument();
    expect(
      within(orphan).getByRole('link', { name: 'Abrir no GitHub a issue #45 (abre em nova aba)' })
    ).toHaveAttribute('href', ISSUE_URL);
  });

  it('F6 a ordem de foco percorre abrir tarefa, abrir no GitHub e marcar como lida', async () => {
    const user = userEvent.setup();
    api.listNotifications.mockResolvedValue(listing([githubNotification(1)]));
    renderPage();
    const card = await waitFor(() => cardOf('TASK-101'));

    within(card).getByRole('link', { name: 'Abrir tarefa TASK-101' }).focus();
    await user.tab();
    expect(within(card).getByRole('link', { name: /Abrir no GitHub/ })).toHaveFocus();
    await user.tab();
    expect(
      within(card).getByRole('button', { name: 'Marcar como lida: TASK-101 Tarefa 1' })
    ).toHaveFocus();
  });

  it('F7 F8 tipos misturados: marca como lida e não guarda nada no navegador', async () => {
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
      within(cardOf('TASK-103')).getByText('Ana Souza moveu de A fazer para Em andamento')
    ).toBeInTheDocument();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('F9 a abertura da central descreve os avisos de tarefa e os do GitHub com seus destinatários', async () => {
    api.listNotifications.mockResolvedValue(listing([githubNotification(1)]));
    renderPage();

    const heading = await screen.findByRole('heading', { level: 1, name: 'Notificações' });
    const introduction = heading.parentElement.querySelector('p');
    expect(introduction).toHaveTextContent(
      'mudanças de status feitas por outras pessoas e prazos vencidos nas tarefas pelas quais você é responsável'
    );
    expect(introduction).toHaveTextContent(
      'issues e pull requests do GitHub fechadas, reabertas ou mescladas nas tarefas de que você participa'
    );
  });
});
