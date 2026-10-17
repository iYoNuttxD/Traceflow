import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const trace = vi.hoisted(() => ({
  getTraceabilityAlertIndex: vi.fn(),
  getTraceabilityAlert: vi.fn(),
  getTraceabilityAlerts: vi.fn(),
  dismissTraceabilityAlert: vi.fn(),
  getTraceabilityAlertSummary: vi.fn(),
  reconcileTraceabilityAlerts: vi.fn(),
  getCommitSuggestions: vi.fn(),
  confirmCommitSuggestion: vi.fn(),
  rejectCommitSuggestion: vi.fn(),
  scanCommitSuggestions: vi.fn()
}));
const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  listProjects: vi.fn(),
  listTasks: vi.fn(),
  getTask: vi.fn(),
  listMembers: vi.fn(),
  listSprints: vi.fn(),
  listRequirements: vi.fn(),
  getProjectArtifacts: vi.fn(),
  getProjectPullRequests: vi.fn()
}));
const USER = vi.hoisted(() => ({
  id: 7,
  name: 'Ana Souza',
  email: 'ana@example.invalid',
  accountStatus: 'ACTIVE',
  emailVerifiedAt: '2026-10-01T12:00:00.000Z'
}));

vi.mock('../../../src/features/traceability/api/traceability.api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  ...trace
}));
vi.mock('../../../src/features/tasks/api/tasks.api.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    tasksApi: { ...actual.tasksApi, list: mocks.listTasks, get: mocks.getTask },
    getTaskTimeEntries: vi.fn().mockResolvedValue({
      entries: [],
      running: null,
      effort: { actualHours: 0 },
      permissions: { canOperate: false },
      pagination: {}
    }),
    getTaskComments: vi.fn().mockResolvedValue({
      comments: [],
      permissions: { canComment: false },
      pagination: { hasMore: false }
    })
  };
});
vi.mock('../../../src/features/projects/api/projects.api.js', () => ({
  projectsApi: { get: mocks.getProject, list: mocks.listProjects }
}));
vi.mock('../../../src/features/members/members.api.js', () => ({
  membersApi: { list: mocks.listMembers }
}));
vi.mock('../../../src/features/schedule/api/schedule.api.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, scheduleApi: { ...actual.scheduleApi, listSprints: mocks.listSprints } };
});
vi.mock('../../../src/features/requirements/api/requirements.api.js', () => ({
  requirementsApi: { listByProject: mocks.listRequirements }
}));
vi.mock('../../../src/features/github/api/github.api.js', () => ({
  getProjectArtifacts: mocks.getProjectArtifacts,
  getProjectPullRequests: mocks.getProjectPullRequests,
  getProjectCommits: vi.fn().mockResolvedValue({ commits: [] }),
  getProjectIssues: vi.fn().mockResolvedValue({ issues: [] })
}));
vi.mock('../../../src/features/testCases/api/test-cases.api.js', () => ({
  testCasesApi: { list: vi.fn().mockResolvedValue({ items: [], total: 0 }) }
}));
vi.mock('../../../src/features/defects/api/defects.api.js', () => ({
  defectsApi: { list: vi.fn().mockResolvedValue({ items: [], total: 0 }) }
}));
vi.mock('../../../src/features/notifications/api/notifications.api.js', () => ({
  listNotifications: vi.fn(),
  getUnreadNotificationCount: vi.fn().mockResolvedValue({ unreadCount: 0 }),
  markNotification: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  getNotificationPreferences: vi.fn(),
  saveNotificationPreferences: vi.fn()
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
vi.mock('../../../src/pages/TasksPage.jsx', () => ({ TasksPage: () => <Probe /> }));
vi.mock('../../../src/pages/TraceabilityPage.jsx', () => ({ TraceabilityPage: () => <Probe /> }));

const { TasksScreen } = await import('../../../src/features/tasks/pages/TasksScreen.jsx');
const { KanbanBoard } = await import('../../../src/features/tasks/components/KanbanBoard.jsx');
const { KanbanFilters } = await import('../../../src/features/tasks/components/KanbanFilters.jsx');
const { EMPTY_KANBAN_FILTERS } =
  await import('../../../src/features/tasks/components/kanban-view.js');
const { RepositoryInfoScreen } =
  await import('../../../src/features/github/pages/RepositoryInfoScreen.jsx');
const { InconsistencySummary } =
  await import('../../../src/features/traceability/components/InconsistencySummary.jsx');
const { AppRoutes } = await import('../../../src/app/routes/AppRoutes.jsx');
const { ThemeProvider } = await import('../../../src/app/theme/ThemeProvider.jsx');
const { ConfirmProvider } = await import('../../../src/shared/index.js');
const { formatInstant } = await import('../../../src/features/traceability/model/alert-view.js');

function Probe() {
  const location = useLocation();
  return <output aria-label="Destino">{`${location.pathname}${location.search}`}</output>;
}

const XSS = '<img src=x onerror="window.__pr26indicacao=1">';

function task(id, overrides = {}) {
  return {
    id,
    projectId: 9,
    title: `Tarefa ${id}`,
    description: '',
    priority: 'MEDIA',
    status: 'A_FAZER',
    responsibleUser: { id: 2, name: 'Bruno Lima' },
    sprintId: null,
    deadline: null,
    estimatedEffort: null,
    actualEffort: 0,
    requirement: null,
    pullRequest: null,
    commits: [],
    issues: [],
    ...overrides
  };
}

const concluded = task(31, { title: 'Publicar entrega', status: 'CONCLUIDO' });
const linked = task(32, {
  title: 'Login',
  status: 'EM_ANDAMENTO',
  requirement: { id: 8, title: 'Acesso' },
  commits: [{ id: 1, shortHash: 'a1b2c3d', message: 'feat: login' }]
});
const unlinked = task(33, { title: 'Documentar', requirement: { id: 8, title: 'Acesso' } });

const roles = {
  VIEWER: { canLink: false, canManage: false },
  MEMBER: { canLink: true, canManage: false },
  MANAGER: { canLink: true, canManage: true }
};

const OCCURRED = '2026-10-12T17:30:00.000Z';
const DETECTED = '2026-10-12T17:31:00.000Z';

function alert(id, overrides = {}) {
  return {
    id,
    type: 'TASK_CONCLUDED_WITHOUT_COMMIT',
    status: 'OPEN',
    occurredAt: OCCURRED,
    detectedAt: DETECTED,
    resolvedAt: null,
    resolutionReason: null,
    dismissal: null,
    limitations: [],
    subject: {
      type: 'TASK',
      id: 31,
      code: 'TASK-31',
      title: 'Publicar entrega',
      available: true,
      githubUrl: null
    },
    ...overrides
  };
}

const openAlert = alert(501);
const dismissedBefore = alert(400, {
  status: 'DISMISSED',
  detectedAt: '2026-10-01T10:00:00.000Z',
  dismissal: {
    at: '2026-10-03T12:00:00.000Z',
    reason: 'Tarefa de documentação, sem código.',
    by: { id: 3, name: 'Carla Dias' }
  }
});
const resolvedBefore = alert(300, {
  status: 'RESOLVED',
  detectedAt: '2026-09-20T10:00:00.000Z',
  resolvedAt: '2026-09-22T12:00:00.000Z',
  resolutionReason: 'COMMIT_LINKED'
});

function arrangeTasks(role = 'MANAGER', { index = [{ subjectId: 31, alertId: 501 }] } = {}) {
  mocks.getProject.mockResolvedValue({
    data: { project: { id: 9, name: 'TraceFlow', githubIntegration: { status: 'ACTIVE' } } }
  });
  mocks.listTasks.mockResolvedValue({ data: { tasks: [concluded, linked, unlinked] } });
  mocks.getTask.mockImplementation(async (id) => ({
    data: { task: [concluded, linked, unlinked].find((item) => item.id === id) }
  }));
  mocks.listMembers.mockResolvedValue({ currentMembership: { role }, members: [] });
  mocks.listSprints.mockResolvedValue({ data: { sprints: [] } });
  mocks.listRequirements.mockResolvedValue({ data: { requirements: [] } });
  mocks.getProjectPullRequests.mockResolvedValue({ pullRequests: [] });
  trace.getTraceabilityAlertIndex.mockResolvedValue({
    projectId: 9,
    status: 'OPEN',
    tasks: index,
    pullRequests: [],
    issues: []
  });
  trace.getTraceabilityAlert.mockResolvedValue({
    alert: {
      ...openAlert,
      context: {
        status: 'CONCLUIDO',
        requirement: null,
        responsible: null,
        pullRequest: null,
        issueCount: 0,
        pendingCommitSuggestions: 0,
        integrationConnected: true
      }
    },
    permissions: roles[role]
  });
  trace.getTraceabilityAlerts.mockResolvedValue({
    projectId: 9,
    status: 'ALL',
    alerts: [openAlert, dismissedBefore, resolvedBefore],
    pagination: { page: 1, limit: 50, total: 3, totalPages: 1 },
    permissions: roles[role]
  });
  trace.getCommitSuggestions.mockResolvedValue({
    suggestions: [],
    permissions: { canReview: false },
    pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
  });
}

function renderTasks(entry = '/projects/9/tasks') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <ConfirmProvider>
        <Routes>
          <Route
            path="/projects/:projectId/tasks"
            element={
              <>
                <TasksScreen />
                <Probe />
              </>
            }
          />
        </Routes>
      </ConfirmProvider>
    </MemoryRouter>
  );
}

const cardOf = (id) => screen.getByRole('article', { name: new RegExp(`TASK-${id} `) });

beforeEach(() => {
  vi.clearAllMocks();
  delete window.__pr26indicacao;
});

describe('PR #26 indicações nas tarefas (TF-REV-008, RF13, RF58)', () => {
  it('X-01 o cartão do Kanban mostra "Concluída sem commit" só com alerta aberto e fora do congelado, e a linha separa vínculo técnico de requisito', async () => {
    const user = userEvent.setup();
    const onOpenInconsistency = vi.fn();
    const frozen = { ...task(34, { status: 'CONCLUIDO' }), isFrozen: true };
    render(
      <MemoryRouter>
        <KanbanBoard
          board={{
            columns: { A_FAZER: [unlinked], EM_ANDAMENTO: [linked], CONCLUIDO: [concluded, frozen] }
          }}
          openAlertTasks={
            new Map([
              [31, 501],
              [34, 502]
            ])
          }
          onSelectTask={vi.fn()}
          onOpenHistory={vi.fn()}
          onOpenInconsistency={onOpenInconsistency}
          onTaskDragStart={vi.fn()}
          onTaskDragEnd={vi.fn()}
        />
      </MemoryRouter>
    );

    const markers = screen.getAllByRole('button', { name: /^Concluída sem commit/ });
    expect(markers).toHaveLength(1);
    expect(markers[0]).toHaveAccessibleName(
      'Concluída sem commit: abrir a inconsistência da TASK-31'
    );
    await user.click(markers[0]);
    expect(onOpenInconsistency).toHaveBeenCalledWith(concluded, markers[0]);
    const card = (id) => document.querySelector(`[data-kanban-task-id="${id}"]`);
    expect(card(33)).toHaveTextContent('Sem vínculo técnico · 1 req');
    expect(card(32)).toHaveTextContent('1 commit · 1 req');
    expect(card(31)).toHaveTextContent('Sem vínculo técnico · Sem requisito');
    expect(within(card(33)).getByText('Sem vínculo técnico')).toHaveClass(
      'task-trace-line__missing'
    );
    expect(within(card(31)).getByText('Sem requisito')).toHaveClass('task-trace-line__discreet');
  });

  it('X-02 a lista mostra o marcador, a linha de rastreabilidade e abre os detalhes na seção de inconsistência com o foco no título', async () => {
    const user = userEvent.setup();
    arrangeTasks();
    renderTasks();

    const marker = await screen.findByRole('button', {
      name: 'Concluída sem commit: abrir a inconsistência da TASK-31'
    });
    expect(within(cardOf(32)).queryByRole('button', { name: /Concluída sem commit/ })).toBeNull();
    expect(cardOf(33)).toHaveTextContent('Sem vínculo técnico · 1 req');
    await user.click(marker);

    const heading = await screen.findByRole('heading', {
      name: 'Inconsistência: tarefa concluída sem commit'
    });
    await waitFor(() => expect(heading).toHaveFocus());
    const section = heading.closest('section');
    expect(section).toHaveTextContent(
      `Concluída em ${formatInstant(OCCURRED)} · detectada em ${formatInstant(DETECTED)}.`
    );
    expect(trace.getTraceabilityAlert).toHaveBeenCalledWith('9', 501, { fresh: true });
    expect(trace.getTraceabilityAlerts).toHaveBeenCalledWith(
      '9',
      { status: 'ALL', taskId: 31, limit: 50 },
      expect.objectContaining({ fresh: true })
    );
  });

  it('X-03 o resumo conta as sem vínculo técnico e o filtro de "Buscar e filtrar" aplica e retira, com a URL acompanhando', async () => {
    const user = userEvent.setup();
    arrangeTasks();
    renderTasks();

    const overview = await screen.findByRole('region', { name: 'Visão geral das tarefas' });
    await waitFor(() =>
      expect(within(overview).getByText('Sem vínculo técnico').closest('div')).toHaveTextContent(
        'Sem vínculo técnico2'
      )
    );
    await user.click(screen.getByRole('button', { name: /Buscar e filtrar/ }));
    const select = screen.getByRole('combobox', { name: 'Rastreabilidade' });
    await user.selectOptions(select, 'SEM_VINCULO');

    expect(screen.queryByRole('article', { name: /TASK-32 / })).toBeNull();
    expect(cardOf(31)).toBeInTheDocument();
    expect(cardOf(33)).toBeInTheDocument();
    expect(screen.getByLabelText('Destino')).toHaveTextContent(
      '/projects/9/tasks?rastreabilidade=SEM_VINCULO'
    );
    await user.selectOptions(select, '');
    expect(cardOf(32)).toBeInTheDocument();
    expect(screen.getByLabelText('Destino')).toHaveTextContent(/^\/projects\/9\/tasks$/);
  });

  it('X-04 o filtro Rastreabilidade tem as duas opções, e o quadro congelado não oferece a das concluídas sem commit', async () => {
    const user = userEvent.setup();
    const props = {
      filters: { ...EMPTY_KANBAN_FILTERS },
      members: [],
      activeCount: 0,
      visibleCount: 3,
      scopedCount: 3,
      onChange: vi.fn(),
      onClear: vi.fn()
    };
    const { rerender } = render(<KanbanFilters {...props} />);
    await user.click(screen.getByRole('button', { name: /Buscar e filtrar/ }));
    const select = screen.getByRole('combobox', { name: 'Rastreabilidade' });
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual(['Todas', 'Sem vínculo técnico', 'Concluídas sem commit']);
    await user.selectOptions(select, 'SEM_COMMIT');
    expect(props.onChange).toHaveBeenCalledWith('traceability', 'SEM_COMMIT');

    rerender(<KanbanFilters {...props} frozen />);
    expect(
      within(screen.getByRole('combobox', { name: 'Rastreabilidade' }))
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual(['Todas', 'Sem vínculo técnico']);
  });

  it('X-05 o link "?rastreabilidade=SEM_COMMIT" chega filtrado pelas concluídas sem commit', async () => {
    arrangeTasks();
    renderTasks('/projects/9/tasks?rastreabilidade=SEM_COMMIT');

    await waitFor(() => expect(cardOf(31)).toBeInTheDocument());
    expect(screen.queryByRole('article', { name: /TASK-32 / })).toBeNull();
    expect(screen.queryByRole('article', { name: /TASK-33 / })).toBeNull();
    expect(
      screen.getByRole('button', { name: /Filtrar tarefas|Buscar e filtrar/ })
    ).toHaveTextContent('1 filtro ativo');
  });

  it('X-06 MANAGER dispensa na seção com justificativa validada; o marcador some e a dispensa fica avisada', async () => {
    const user = userEvent.setup();
    arrangeTasks('MANAGER');
    trace.dismissTraceabilityAlert.mockResolvedValue({ alert: openAlert, changed: true });
    renderTasks();
    await user.click(
      await screen.findByRole('button', { name: /^Concluída sem commit: abrir a inconsistência/ })
    );
    const heading = await screen.findByRole('heading', {
      name: 'Inconsistência: tarefa concluída sem commit'
    });
    const section = heading.closest('section');

    await user.click(within(section).getByRole('button', { name: 'Dispensar' }));
    await user.type(within(section).getByLabelText('Justificativa'), 'curto');
    await user.click(within(section).getByRole('button', { name: 'Dispensar' }));
    expect(
      within(section).getByText('A justificativa deve ter entre 10 e 500 caracteres.')
    ).toBeInTheDocument();
    expect(trace.dismissTraceabilityAlert).not.toHaveBeenCalled();

    trace.getTraceabilityAlert.mockResolvedValue({
      alert: { ...openAlert, status: 'DISMISSED' },
      permissions: roles.MANAGER
    });
    trace.getTraceabilityAlertIndex.mockResolvedValue({ tasks: [], pullRequests: [], issues: [] });
    await user.type(within(section).getByLabelText('Justificativa'), ' demais: documentação.');
    await user.click(within(section).getByRole('button', { name: 'Dispensar' }));

    expect(
      await screen.findByText('Inconsistência dispensada. O registro continua no histórico.')
    ).toBeInTheDocument();
    expect(trace.dismissTraceabilityAlert).toHaveBeenCalledWith(
      '9',
      501,
      'curto demais: documentação.'
    );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^Concluída sem commit/ })).toBeNull()
    );
    expect(
      screen.queryByRole('heading', { name: 'Inconsistência: tarefa concluída sem commit' })
    ).toBeNull();
  });

  it('X-07 o histórico lista dispensa e resolução anteriores com quem, quando e por quê', async () => {
    const user = userEvent.setup();
    arrangeTasks('MEMBER');
    renderTasks();
    await user.click(
      await screen.findByRole('button', { name: /^Concluída sem commit: abrir a inconsistência/ })
    );
    const section = (
      await screen.findByRole('heading', { name: 'Inconsistência: tarefa concluída sem commit' })
    ).closest('section');

    const toggle = await within(section).findByRole('button', { name: 'Histórico (2)' });
    await waitFor(() => expect(toggle).toBeEnabled());
    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const items = within(section).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(
      `Dispensada por Carla Dias em ${formatInstant('2026-10-03T12:00:00.000Z')}`
    );
    expect(items[0]).toHaveTextContent('Justificativa: “Tarefa de documentação, sem código.”');
    expect(items[1]).toHaveTextContent(
      `Resolvida em ${formatInstant('2026-09-22T12:00:00.000Z')} · Commit vinculado`
    );
  });

  it('X-08 VIEWER vê a inconsistência e o histórico, sem vincular nem dispensar', async () => {
    const user = userEvent.setup();
    arrangeTasks('VIEWER');
    renderTasks();
    await user.click(
      await screen.findByRole('button', { name: /^Concluída sem commit: abrir a inconsistência/ })
    );
    const section = (
      await screen.findByRole('heading', { name: 'Inconsistência: tarefa concluída sem commit' })
    ).closest('section');

    expect(
      await within(section).findByRole('button', { name: 'Histórico (2)' })
    ).toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: 'Vincular commit' })).toBeNull();
    expect(within(section).queryByRole('button', { name: 'Dispensar' })).toBeNull();
  });

  it('X-09 "Vincular commit" abre o editor de vínculos com o foco na busca de commits', async () => {
    const user = userEvent.setup();
    arrangeTasks('MEMBER');
    renderTasks();
    await user.click(
      await screen.findByRole('button', { name: /^Concluída sem commit: abrir a inconsistência/ })
    );
    const section = (
      await screen.findByRole('heading', { name: 'Inconsistência: tarefa concluída sem commit' })
    ).closest('section');

    await user.click(within(section).getByRole('button', { name: 'Vincular commit' }));

    await waitFor(() => expect(screen.getByLabelText('Pesquisar commits')).toHaveFocus());
    expect(screen.queryByRole('button', { name: 'Dispensar' })).toBeNull();
  });
});

describe('PR #26 indicações no Repositório (TF-REV-008, RF39, RF40)', () => {
  const pullRequest = {
    id: 70,
    type: 'pull_request',
    title: 'Ajusta CI',
    author: 'carla',
    date: '2026-10-10T12:00:00.000Z',
    githubUrl: 'https://github.com/traceflow/repo/pull/42',
    metadata: { number: 42, state: 'merged', sourceBranch: 'ci', targetBranch: 'main' },
    inconsistency: {
      alertId: 12,
      status: 'OPEN',
      detectedAt: '2026-10-10T12:15:00.000Z',
      resolvedAt: null,
      dismissedAt: null
    }
  };
  const issue = {
    id: 71,
    type: 'issue',
    title: XSS,
    author: 'bruno',
    date: '2026-10-09T12:00:00.000Z',
    githubUrl: null,
    metadata: { number: 45, state: 'closed' },
    inconsistency: {
      alertId: 13,
      status: 'DISMISSED',
      detectedAt: '2026-10-02T12:00:00.000Z',
      resolvedAt: null,
      dismissedAt: '2026-10-03T12:00:00.000Z'
    }
  };
  const commit = {
    id: 72,
    type: 'commit',
    title: 'feat: login',
    author: 'ana',
    date: '2026-10-08T12:00:00.000Z',
    githubUrl: null,
    metadata: { branches: ['main'] },
    inconsistency: null
  };

  function arrangeRepository(artifacts = [pullRequest, issue, commit]) {
    mocks.getProject.mockResolvedValue({
      data: {
        project: {
          id: 9,
          name: 'TraceFlow',
          githubIntegration: { status: 'ACTIVE', lastSyncStatus: 'SUCESSO' }
        }
      }
    });
    mocks.listMembers.mockResolvedValue({ currentMembership: { role: 'MANAGER' }, members: [] });
    mocks.getProjectArtifacts.mockResolvedValue({
      summary: { total: artifacts.length, commits: 1, pullRequests: 1, issues: 1 },
      repository: { defaultBranch: 'main', branches: [] },
      artifacts
    });
    trace.getTraceabilityAlert.mockResolvedValue({
      alert: {
        ...alert(12, {
          type: 'PULL_REQUEST_MERGED_WITHOUT_TASK',
          subject: {
            type: 'PULL_REQUEST',
            id: 70,
            code: 'PR #42',
            title: 'Ajusta CI',
            available: true,
            githubUrl: 'https://github.com/traceflow/repo/pull/42'
          }
        }),
        context: {
          number: 42,
          title: 'Ajusta CI',
          sourceBranch: 'ci',
          targetBranch: 'main',
          mergedAt: OCCURRED,
          githubUrl: 'https://github.com/traceflow/repo/pull/42'
        }
      },
      permissions: roles.MANAGER
    });
    trace.getTraceabilityAlerts.mockResolvedValue({
      alerts: [],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
      permissions: roles.MANAGER
    });
  }

  function renderRepository(entry = '/projects/9/repository') {
    return render(
      <MemoryRouter initialEntries={[entry]}>
        <ConfirmProvider>
          <Routes>
            <Route
              path="/projects/:projectId/repository"
              element={
                <>
                  <RepositoryInfoScreen />
                  <Probe />
                </>
              }
            />
          </Routes>
        </ConfirmProvider>
      </MemoryRouter>
    );
  }

  it('X-10 o estado mostra "sem tarefa", o filtro Inconsistência vai ao servidor e o link de lista chega filtrado', async () => {
    const user = userEvent.setup();
    arrangeRepository();
    renderRepository();

    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('#42 · ');
    expect(rows[1]).toHaveTextContent('sem tarefa vinculada');
    expect(rows[2]).toHaveTextContent(
      `sem tarefa · dispensada em ${new Intl.DateTimeFormat('pt-BR').format(new Date('2026-10-03T12:00:00.000Z'))}`
    );
    expect(within(rows[3]).queryByRole('button', { name: /Ver inconsistência/ })).toBeNull();
    expect(rows[2]).toHaveTextContent(XSS);
    expect(document.body.querySelector('img')).toBeNull();
    expect(
      within(rows[1]).getByRole('button', { name: 'Ver inconsistência da PR #42' })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Filtrar artefatos/ }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Inconsistência' }), 'OPEN');
    await waitFor(() =>
      expect(mocks.getProjectArtifacts).toHaveBeenLastCalledWith(
        '9',
        { inconsistency: 'OPEN' },
        expect.any(Object)
      )
    );

    mocks.getProjectArtifacts.mockClear();
    renderRepository('/projects/9/repository?inconsistencia=OPEN&tipo=pull_request');
    await waitFor(() =>
      expect(mocks.getProjectArtifacts).toHaveBeenCalledWith(
        '9',
        { type: 'pull_request', inconsistency: 'OPEN' },
        expect.any(Object)
      )
    );
  });

  it('X-11 "?alerta=" abre a inconsistência; fechar tira o parâmetro e leva o foco ao título da lista', async () => {
    const user = userEvent.setup();
    arrangeRepository();
    renderRepository('/projects/9/repository?alerta=12');

    const dialog = await screen.findByRole('dialog', { name: 'Inconsistência' });
    expect(await within(dialog).findByText('PR #42')).toBeInTheDocument();
    expect(trace.getTraceabilityAlert).toHaveBeenCalledWith(
      '9',
      12,
      expect.objectContaining({ fresh: true })
    );
    await user.click(within(dialog).getByRole('button', { name: /^Fechar/ }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Artefatos do repositório' })).toHaveFocus()
    );
    expect(screen.getByLabelText('Destino')).toHaveTextContent(/^\/projects\/9\/repository$/);
  });
});

describe('PR #26 resumo da Rastreabilidade e rotas antigas (TF-REV-008)', () => {
  function summary({ byType = {}, permissions = roles.MANAGER, ...rest } = {}) {
    const total = Object.values(byType).reduce((sum, count) => sum + count, 0);
    return {
      projectId: 9,
      open: { total, byType },
      dismissed: { total: 0 },
      rules: { taskWithoutCommitActive: true, integrationConnected: true },
      reconciliation: null,
      permissions,
      ...rest
    };
  }

  function renderSummary() {
    return render(
      <MemoryRouter>
        <InconsistencySummary projectId="9" />
      </MemoryRouter>
    );
  }

  it('X-12 cada parte do resumo leva à lista filtrada; o reprocessamento é só de MANAGER+', async () => {
    trace.getTraceabilityAlertSummary.mockResolvedValue(
      summary({
        byType: {
          TASK_CONCLUDED_WITHOUT_COMMIT: 3,
          PULL_REQUEST_MERGED_WITHOUT_TASK: 1204,
          ISSUE_CLOSED_WITHOUT_TASK: 1
        }
      })
    );
    const { unmount } = renderSummary();

    expect(
      await screen.findByRole('link', { name: '3 tarefas concluídas sem commit' })
    ).toHaveAttribute('href', '/projects/9/tasks?rastreabilidade=SEM_COMMIT');
    expect(screen.getByRole('link', { name: '1.204 PRs mescladas sem tarefa' })).toHaveAttribute(
      'href',
      '/projects/9/repository?inconsistencia=OPEN&tipo=pull_request'
    );
    expect(screen.getByRole('link', { name: '1 issue fechada sem tarefa' })).toHaveAttribute(
      'href',
      '/projects/9/repository?inconsistencia=OPEN&tipo=issue'
    );
    expect(screen.getByRole('button', { name: 'Reprocessar inconsistências' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Seções da rastreabilidade' })).toBeNull();
    unmount();

    trace.getTraceabilityAlertSummary.mockResolvedValue(summary({ permissions: roles.VIEWER }));
    renderSummary();
    expect(await screen.findAllByText('0')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Reprocessar inconsistências' })).toBeNull();
  });

  it.each([
    ['/projects/9/traceability/alerts', '/projects/9/traceability'],
    ['/projects/9/traceability/unlinked-tasks', '/projects/9/tasks?rastreabilidade=SEM_VINCULO']
  ])('X-13 a rota antiga %s redireciona para %s', async (from, to) => {
    mocks.listProjects.mockResolvedValue({ data: { projects: [] } });
    render(
      <MemoryRouter initialEntries={[from]}>
        <ThemeProvider>
          <ConfirmProvider>
            <AppRoutes />
          </ConfirmProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    expect(await screen.findByLabelText('Destino')).toHaveTextContent(to);
  });

  it('X-14 título com HTML na tarefa aparece como texto no cartão e nos detalhes (o do artefato está no X-10)', async () => {
    const user = userEvent.setup();
    arrangeTasks();
    const hostile = { ...concluded, title: XSS };
    mocks.listTasks.mockResolvedValue({ data: { tasks: [hostile] } });
    mocks.getTask.mockResolvedValue({ data: { task: hostile } });
    renderTasks();

    await user.click(
      await screen.findByRole('button', { name: /^Concluída sem commit: abrir a inconsistência/ })
    );
    await screen.findByRole('heading', { name: 'Inconsistência: tarefa concluída sem commit' });
    expect(screen.getAllByText(XSS, { exact: false }).length).toBeGreaterThan(0);
    expect(document.body.querySelector('img')).toBeNull();
    expect(window.__pr26indicacao).toBeUndefined();
    await act(async () => {});
  });
});
