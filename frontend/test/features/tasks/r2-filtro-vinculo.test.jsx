import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  listTasks: vi.fn(),
  getTask: vi.fn(),
  getBoard: vi.fn(),
  getMetrics: vi.fn(),
  listTaskHistory: vi.fn(),
  listMembers: vi.fn(),
  listSprints: vi.fn(),
  listRequirements: vi.fn(),
  alertIndex: vi.fn()
}));

vi.mock('../../../src/features/tasks/api/tasks.api.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    tasksApi: { ...actual.tasksApi, list: mocks.listTasks, get: mocks.getTask },
    kanbanApi: {
      ...actual.kanbanApi,
      getBoard: mocks.getBoard,
      getMetrics: mocks.getMetrics,
      listTaskHistory: mocks.listTaskHistory
    }
  };
});
vi.mock('../../../src/features/projects/api/projects.api.js', () => ({
  projectsApi: { get: mocks.getProject, list: vi.fn() }
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
  getProjectArtifacts: vi.fn().mockResolvedValue({ artifacts: [] }),
  getProjectPullRequests: vi.fn().mockResolvedValue({ pullRequests: [] }),
  getProjectCommits: vi.fn().mockResolvedValue({ commits: [] }),
  getProjectIssues: vi.fn().mockResolvedValue({ issues: [] })
}));
vi.mock('../../../src/features/traceability/api/traceability.api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getTraceabilityAlertIndex: mocks.alertIndex
}));
vi.mock('../../../src/features/tasks/components/CommitSuggestionsCard.jsx', () => ({
  CommitSuggestionsCard: () => <div>Sugestões de commits</div>
}));

const { TasksScreen } = await import('../../../src/features/tasks/pages/TasksScreen.jsx');
const { KanbanPage } = await import('../../../src/pages/KanbanPage.jsx');
const { ConfirmProvider } = await import('../../../src/shared/index.js');

function Probe() {
  const location = useLocation();
  return <output aria-label="Destino">{`${location.pathname}${location.search}`}</output>;
}

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

const TASKS = [
  task(31, { title: 'Publicar entrega', status: 'CONCLUIDO' }),
  task(32, {
    title: 'Login',
    status: 'EM_ANDAMENTO',
    commits: [{ id: 1, shortHash: 'a1b2c3d', message: 'feat: login' }]
  }),
  task(33, { title: 'Documentar' })
];

const board = () => ({
  columns: Object.fromEntries(
    ['A_FAZER', 'EM_ANDAMENTO', 'CONCLUIDO'].map((status) => [
      status,
      TASKS.filter((item) => item.status === status)
    ])
  ),
  totals: { total: TASKS.length }
});

function renderAt(entry) {
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
          <Route path="/projects/:projectId/kanban" element={<KanbanPage />} />
        </Routes>
      </ConfirmProvider>
    </MemoryRouter>
  );
}

function metricValue(region, label) {
  const term = within(region).getByText(label, { selector: 'dt, span, p, strong' });
  return term.closest('div').textContent.replace(label, '').trim();
}

const cardOf = (id) => screen.queryByRole('article', { name: new RegExp(`TASK-${id} `) });

async function openFilters() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /Buscar e filtrar/ }));
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getProject.mockResolvedValue({
    data: { project: { id: 9, name: 'TraceFlow', githubIntegration: { status: 'ACTIVE' } } }
  });
  mocks.listTasks.mockResolvedValue({ data: { tasks: TASKS } });
  mocks.getTask.mockImplementation(async (id) => ({
    data: { task: TASKS.find((item) => item.id === id) }
  }));
  mocks.getBoard.mockImplementation(async () => ({ data: board() }));
  mocks.getMetrics.mockResolvedValue({
    data: { indicator: 'MOVIMENTACOES', metric: 'Movimentações', totalMovements: 0 }
  });
  mocks.listTaskHistory.mockResolvedValue({
    data: { items: [], total: 0, pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } }
  });
  mocks.listMembers.mockResolvedValue({
    currentMembership: { id: 3, role: 'MANAGER', isActive: true },
    members: []
  });
  mocks.listSprints.mockResolvedValue({ data: { total: 0, sprints: [] } });
  mocks.listRequirements.mockResolvedValue({ data: { requirements: [] } });
  mocks.alertIndex.mockResolvedValue({ tasks: [], pullRequests: [], issues: [] });
});

describe('UX-R2-03 — "Sem vínculo técnico" no resumo e só no filtro', () => {
  it('T-01 o resumo de Tarefas conta as tarefas sem vínculo técnico', async () => {
    renderAt('/projects/9/tasks');

    const overview = await screen.findByRole('region', { name: 'Visão geral das tarefas' });
    await waitFor(() => expect(metricValue(overview, 'Total')).toBe('3'));

    expect(metricValue(overview, 'Sem vínculo técnico')).toBe('2');
  });

  it('T-02 nem Tarefas nem o Kanban têm a faixa separada do vínculo técnico', async () => {
    const tasksView = renderAt('/projects/9/tasks');
    await screen.findByRole('region', { name: 'Visão geral das tarefas' });
    await waitFor(() => expect(cardOf(33)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Sem vínculo técnico:/ })).toBeNull();
    expect(screen.queryByText(/Mostra só as tarefas sem commit/)).toBeNull();
    tasksView.unmount();

    renderAt('/projects/9/kanban');
    await screen.findByRole('region', { name: 'Visão geral do Kanban' });
    expect(screen.queryByRole('button', { name: /Sem vínculo técnico:/ })).toBeNull();
    expect(screen.queryByText(/Mostra só as tarefas sem commit/)).toBeNull();
  });

  it('T-03 o filtro em "Buscar e filtrar" conta como filtro ativo, filtra, vai para a URL e sai com "Limpar filtros"', async () => {
    renderAt('/projects/9/tasks');
    await waitFor(() => expect(cardOf(32)).toBeInTheDocument());
    const user = await openFilters();

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Rastreabilidade' }),
      'SEM_VINCULO'
    );

    expect(screen.getByRole('button', { name: /Buscar e filtrar/ })).toHaveTextContent(
      '1 filtro ativo'
    );
    expect(cardOf(32)).toBeNull();
    expect(cardOf(31)).toBeInTheDocument();
    expect(cardOf(33)).toBeInTheDocument();
    expect(screen.getByLabelText('Destino')).toHaveTextContent(
      '/projects/9/tasks?rastreabilidade=SEM_VINCULO'
    );

    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));

    expect(cardOf(32)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Rastreabilidade' })).toHaveValue('');
    expect(screen.getByLabelText('Destino')).toHaveTextContent(/^\/projects\/9\/tasks$/);
  });

  it('T-04 no Kanban, o contador fica só no resumo, e o filtro, em "Buscar e filtrar"', async () => {
    renderAt('/projects/9/kanban');

    const summary = await screen.findByRole('region', { name: 'Visão geral do Kanban' });
    await waitFor(() => expect(metricValue(summary, 'Sem vínculo técnico')).toBe('2'));
    expect(screen.queryAllByText(/Sem vínculo técnico: \d/)).toEqual([]);

    const user = await openFilters();
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Rastreabilidade' }),
      'SEM_VINCULO'
    );
    expect(screen.getByRole('button', { name: /Buscar e filtrar/ })).toHaveTextContent(
      '1 filtro ativo'
    );
    expect(metricValue(summary, 'Sem vínculo técnico')).toBe('2');
  });

  it('T-05 nenhum código de RF aparece nos rótulos, nas opções e no aviso do índice', async () => {
    mocks.alertIndex.mockRejectedValue(Object.assign(new Error('falhou'), { status: 503 }));
    const tasksView = renderAt('/projects/9/tasks');
    await screen.findByText(/As tarefas concluídas sem commit não puderam ser carregadas/);
    await openFilters();

    expect(
      within(screen.getByRole('combobox', { name: 'Rastreabilidade' }))
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual(['Todas', 'Sem vínculo técnico', 'Concluídas sem commit']);
    expect(document.body.textContent).not.toMatch(/RF58|RF13/);
    tasksView.unmount();

    renderAt('/projects/9/kanban');
    await screen.findByText(/As tarefas concluídas sem commit não puderam ser carregadas/);
    await openFilters();
    expect(document.body.textContent).not.toMatch(/RF58|RF13/);
  });
});
