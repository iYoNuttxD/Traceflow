import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../../src/shared/index.js';

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn() },
  deleteTask: vi.fn(),
  linkTaskCommit: vi.fn(),
  linkTaskIssue: vi.fn(),
  linkTaskRequirement: vi.fn(),
  linkTaskToPullRequest: vi.fn(),
  unlinkTaskCommit: vi.fn(),
  unlinkTaskIssue: vi.fn(),
  unlinkTaskFromPullRequest: vi.fn(),
  unlinkTaskRequirement: vi.fn(),
  tasksApi: { update: vi.fn(), get: vi.fn() },
  kanbanApi: {
    getBoard: vi.fn(),
    getMetrics: vi.fn(),
    listTaskHistory: vi.fn(),
    moveTask: vi.fn()
  },
  membersApi: { list: vi.fn() },
  scheduleApi: { listSprints: vi.fn(), listSprintTasks: vi.fn() },
  requirementsApi: { listByProject: vi.fn() },
  githubApi: {
    getProjectCommits: vi.fn(),
    getProjectIssues: vi.fn(),
    getProjectPullRequests: vi.fn()
  }
}));

vi.mock('../../src/features/tasks/api/tasks.api.js', () => ({
  kanbanApi: mocks.kanbanApi,
  tasksApi: mocks.tasksApi,
  deleteTask: mocks.deleteTask,
  linkTaskCommit: mocks.linkTaskCommit,
  linkTaskIssue: mocks.linkTaskIssue,
  linkTaskRequirement: mocks.linkTaskRequirement,
  linkTaskToPullRequest: mocks.linkTaskToPullRequest,
  unlinkTaskCommit: mocks.unlinkTaskCommit,
  unlinkTaskIssue: mocks.unlinkTaskIssue,
  unlinkTaskFromPullRequest: mocks.unlinkTaskFromPullRequest,
  unlinkTaskRequirement: mocks.unlinkTaskRequirement
}));
vi.mock('../../src/features/members/members.api.js', () => ({
  membersApi: mocks.membersApi
}));
vi.mock('../../src/features/projects/api/projects.api.js', () => ({
  projectsApi: { get: (id) => mocks.api.get(`/projects/${id}`) }
}));
// Mock no modulo de API, e nao no `index.js` da feature: assim os helpers de
// status continuam sendo os de verdade.
vi.mock('../../src/features/schedule/api/schedule.api.js', () => ({
  scheduleApi: mocks.scheduleApi
}));
vi.mock('../../src/features/requirements/api/requirements.api.js', () => ({
  requirementsApi: mocks.requirementsApi
}));
vi.mock('../../src/features/github/api/github.api.js', () => ({
  getProjectCommits: mocks.githubApi.getProjectCommits,
  getProjectIssues: mocks.githubApi.getProjectIssues,
  getProjectPullRequests: mocks.githubApi.getProjectPullRequests
}));
vi.mock('../../src/features/tasks/components/CommitSuggestionsCard.jsx', () => ({
  CommitSuggestionsCard: () => <div>Sugestões de commits</div>
}));

import { KanbanPage } from '../../src/pages/KanbanPage.jsx';

const task = {
  id: 7,
  projectId: 1,
  title: 'Tarefa E11',
  status: 'A_FAZER',
  priority: 'MEDIA',
  responsibleUser: { id: 5, name: 'Responsável real' },
  commits: [],
  issues: []
};

const board = {
  columns: { A_FAZER: [task], EM_ANDAMENTO: [], CONCLUIDO: [] },
  totals: { A_FAZER: 1, EM_ANDAMENTO: 0, CONCLUIDO: 0, total: 1 }
};

let navigateKanban;

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function KanbanHarness() {
  navigateKanban = useNavigate();
  return <KanbanPage />;
}

function historyResponse(overrides = {}) {
  return {
    data: {
      items: [],
      total: 0,
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
      ...overrides
    }
  };
}

function renderPage(initialEntry = '/projects/1/kanban') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/projects/:projectId/kanban"
          element={
            <ConfirmProvider>
              <KanbanHarness />
            </ConfirmProvider>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

function dragTaskTo(columnName) {
  const dataTransfer = {
    effectAllowed: '',
    dropEffect: '',
    setData: vi.fn(),
    getData: vi.fn(() => String(task.id))
  };
  fireEvent.dragStart(screen.getByRole('button', { name: 'Abrir detalhes de Tarefa E11' }), {
    dataTransfer
  });
  fireEvent.drop(screen.getByRole('heading', { name: columnName }).closest('section'), {
    dataTransfer
  });
}

describe('KanbanPage E11', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateKanban = undefined;
    mocks.api.get.mockResolvedValue({ data: { project: { id: 1, name: 'Projeto E11' } } });
    mocks.kanbanApi.getBoard.mockResolvedValue({ data: board });
    mocks.kanbanApi.getMetrics.mockResolvedValue({
      data: { indicator: 'MOVIMENTACOES', metric: 'Movimentações', totalMovements: 0 }
    });
    mocks.kanbanApi.listTaskHistory.mockResolvedValue(historyResponse());
    mocks.membersApi.list.mockResolvedValue({
      currentMembership: { id: 3, role: 'MEMBER', isActive: true },
      members: [{ id: 3, userId: 5, isActive: true, user: { id: 5, name: 'Responsável real' } }]
    });
    mocks.scheduleApi.listSprints.mockResolvedValue({ data: { total: 0, sprints: [] } });
    mocks.requirementsApi.listByProject.mockResolvedValue({ data: { requirements: [] } });
    mocks.githubApi.getProjectPullRequests.mockResolvedValue({ pullRequests: [] });
    mocks.githubApi.getProjectCommits.mockResolvedValue({ commits: [] });
    mocks.githubApi.getProjectIssues.mockResolvedValue({ issues: [] });
    mocks.deleteTask.mockResolvedValue({ message: 'Tarefa excluída com sucesso.' });
    mocks.tasksApi.update.mockResolvedValue({
      data: { message: 'Tarefa atualizada com sucesso.', task }
    });
  });

  it('move a tarefa enviando somente o status e usa o responsável canônico', async () => {
    mocks.kanbanApi.moveTask.mockResolvedValue({
      data: {
        message: 'Tarefa movida com sucesso.',
        task: { ...task, status: 'EM_ANDAMENTO' },
        movement: { id: 1 }
      }
    });
    renderPage();

    expect((await screen.findAllByText('Responsável real')).length).toBeGreaterThan(0);
    dragTaskTo('Em Andamento');

    await waitFor(() =>
      expect(mocks.kanbanApi.moveTask).toHaveBeenCalledWith(7, {
        toStatus: 'EM_ANDAMENTO'
      })
    );
    expect(mocks.kanbanApi.moveTask.mock.calls[0][1]).not.toHaveProperty('movedBy');
    expect(mocks.kanbanApi.moveTask.mock.calls[0][1]).not.toHaveProperty('projectMemberId');
  });

  it.each([
    ['EM_ANDAMENTO', 'Concluído', 'CONCLUIDO'],
    ['CONCLUIDO', 'A Fazer', 'A_FAZER']
  ])('move de %s para %s quando o domínio permite', async (fromStatus, columnName, toStatus) => {
    const moved = { ...task, status: fromStatus };
    mocks.kanbanApi.getBoard.mockResolvedValue({
      data: {
        columns: {
          A_FAZER: fromStatus === 'A_FAZER' ? [moved] : [],
          EM_ANDAMENTO: fromStatus === 'EM_ANDAMENTO' ? [moved] : [],
          CONCLUIDO: fromStatus === 'CONCLUIDO' ? [moved] : []
        },
        totals: { A_FAZER: 0, EM_ANDAMENTO: 0, CONCLUIDO: 0, total: 1 }
      }
    });
    mocks.kanbanApi.moveTask.mockResolvedValue({
      data: {
        message: 'Tarefa movida com sucesso.',
        task: { ...moved, status: toStatus },
        movement: { id: 2 }
      }
    });
    renderPage();
    await screen.findByText('Tarefa E11');
    dragTaskTo(columnName);

    await waitFor(() => expect(mocks.kanbanApi.moveTask).toHaveBeenCalledWith(7, { toStatus }));
  });

  it('mantém a tarefa na coluna de origem quando a mutation falha', async () => {
    mocks.kanbanApi.moveTask.mockRejectedValue({
      response: { status: 500, data: { message: 'Falha ao mover.' } }
    });
    renderPage();
    await screen.findByText('Tarefa E11');
    dragTaskTo('Em Andamento');

    expect(await screen.findByText(/problema interno/)).toBeInTheDocument();
    expect(screen.getByLabelText('1 tarefa')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'A Fazer' })).toBeInTheDocument();
  });

  it('mantém o quadro coerente e recarrega os dados diante de conflito 409', async () => {
    mocks.kanbanApi.moveTask.mockRejectedValue({
      response: { status: 409, data: { message: 'A tarefa foi alterada por outra operação.' } }
    });
    renderPage();
    await screen.findByText('Tarefa E11');

    dragTaskTo('Em Andamento');

    expect(
      await screen.findByText('A tarefa foi alterada por outra operação.')
    ).toBeInTheDocument();
    await waitFor(() => expect(mocks.kanbanApi.getBoard).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('heading', { name: 'A Fazer' })).toBeInTheDocument();
  });

  it('abre e pagina somente o histórico da tarefa selecionada', async () => {
    const user = userEvent.setup();
    mocks.kanbanApi.listTaskHistory
      .mockResolvedValueOnce(
        historyResponse({
          items: [
            {
              id: 1,
              taskId: 7,
              taskTitle: 'Tarefa E11',
              actorUserId: 5,
              actor: { id: 5, name: 'Responsável real' },
              field: 'STATUS',
              fromValue: 'A_FAZER',
              toValue: 'EM_ANDAMENTO',
              occurredAt: '2026-07-26T12:00:00.000Z'
            }
          ],
          total: 11,
          pagination: { page: 1, limit: 10, total: 11, totalPages: 2 }
        })
      )
      .mockResolvedValueOnce(
        historyResponse({
          items: [
            {
              id: 2,
              taskId: 7,
              taskTitle: 'Tarefa E11',
              actorUserId: 5,
              actor: { id: 5, name: 'Responsável real' },
              field: 'PRIORITY',
              fromValue: 'MEDIA',
              toValue: 'ALTA',
              occurredAt: '2026-07-26T13:00:00.000Z'
            }
          ],
          pagination: { page: 2, limit: 10, total: 11, totalPages: 2 },
          total: 11
        })
      );
    renderPage();
    await screen.findByText('Tarefa E11');
    expect(screen.queryByRole('heading', { name: 'Histórico de tarefas' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver histórico da tarefa Tarefa E11' }));

    const historyDialog = await screen.findByRole('dialog', { name: /Histórico — #7/ });
    expect(within(historyDialog).getByText('Status alterado')).toBeInTheDocument();
    expect(within(historyDialog).getByText('A Fazer')).toBeInTheDocument();
    expect(within(historyDialog).getByText('Em Andamento')).toBeInTheDocument();
    expect(mocks.kanbanApi.listTaskHistory).toHaveBeenNthCalledWith(
      1,
      '1',
      { taskId: 7, page: 1, limit: 10 },
      { signal: expect.any(AbortSignal) }
    );
    await user.click(screen.getByRole('button', { name: 'Próxima' }));
    await waitFor(() =>
      expect(mocks.kanbanApi.listTaskHistory).toHaveBeenLastCalledWith(
        '1',
        {
          taskId: 7,
          page: 2,
          limit: 10
        },
        { signal: expect.any(AbortSignal) }
      )
    );
    expect(await screen.findByText('Prioridade alterada')).toBeInTheDocument();
    expect(within(historyDialog).getByText('Média')).toBeInTheDocument();
    expect(within(historyDialog).getByText('Alta')).toBeInTheDocument();
  });

  it('mostra o clear compacto do histórico somente após aplicar filtros', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(
      await screen.findByRole('button', { name: 'Ver histórico da tarefa Tarefa E11' })
    );
    const historyDialog = await screen.findByRole('dialog', { name: /Histórico — #7/ });
    expect(within(historyDialog).queryByRole('button', { name: 'Limpar filtros' })).toBeNull();

    fireEvent.change(within(historyDialog).getByLabelText('Data inicial'), {
      target: { value: '2026-07-01' }
    });
    expect(within(historyDialog).queryByRole('button', { name: 'Limpar filtros' })).toBeNull();
    await user.click(within(historyDialog).getByRole('button', { name: 'Filtrar' }));

    await waitFor(() =>
      expect(mocks.kanbanApi.listTaskHistory).toHaveBeenLastCalledWith(
        '1',
        { taskId: 7, startDate: '2026-07-01', page: 1, limit: 10 },
        { signal: expect.any(AbortSignal) }
      )
    );
    const clear = within(historyDialog).getByRole('button', { name: 'Limpar filtros' });
    expect(clear).toHaveClass('button-outline');
    await user.click(clear);
    await waitFor(() =>
      expect(within(historyDialog).queryByRole('button', { name: 'Limpar filtros' })).toBeNull()
    );
  });

  it('não faz GET periódico nem reage a focus/visibility depois da carga inicial', async () => {
    renderPage();
    await screen.findByText('Tarefa E11');
    expect(mocks.kanbanApi.getBoard).toHaveBeenCalledOnce();

    vi.useFakeTimers();
    await act(async () => {
      vi.advanceTimersByTime(60_000);
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    vi.useRealTimers();
    expect(mocks.kanbanApi.getBoard).toHaveBeenCalledOnce();
  });

  it('confirma a exclusão e move o foco para o quadro estável', async () => {
    const user = userEvent.setup();
    mocks.kanbanApi.getBoard.mockResolvedValueOnce({ data: board }).mockResolvedValueOnce({
      data: {
        columns: { A_FAZER: [], EM_ANDAMENTO: [], CONCLUIDO: [] },
        totals: { A_FAZER: 0, EM_ANDAMENTO: 0, CONCLUIDO: 0, total: 0 }
      }
    });
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Abrir detalhes de Tarefa E11' }));
    await user.click(screen.getByRole('button', { name: 'Excluir tarefa' }));
    const confirmation = screen.getByRole('dialog', { name: 'Excluir tarefa' });
    await user.click(within(confirmation).getByRole('button', { name: 'Excluir tarefa' }));

    await waitFor(() => expect(mocks.deleteTask).toHaveBeenCalledWith(7));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Kanban' })).toHaveFocus());
  });

  it('invalida resposta do Project A depois de navegar para o Project B', async () => {
    const projectA = deferred();
    const taskB = { ...task, id: 8, projectId: 2, title: 'Tarefa do projeto B' };
    const boardB = {
      columns: { A_FAZER: [taskB], EM_ANDAMENTO: [], CONCLUIDO: [] },
      totals: { A_FAZER: 1, EM_ANDAMENTO: 0, CONCLUIDO: 0, total: 1 }
    };
    mocks.kanbanApi.getBoard
      .mockReset()
      .mockReturnValueOnce(projectA.promise)
      .mockResolvedValueOnce({ data: boardB });
    renderPage();
    await waitFor(() => expect(mocks.kanbanApi.getBoard).toHaveBeenCalledTimes(1));

    await act(async () => navigateKanban('/projects/2/kanban'));
    expect(await screen.findByText('Tarefa do projeto B')).toBeInTheDocument();

    await act(async () => {
      projectA.resolve({ data: board });
      await Promise.resolve();
    });
    expect(screen.getByText('Tarefa do projeto B')).toBeInTheDocument();
    expect(screen.queryByText('Tarefa E11')).not.toBeInTheDocument();
    expect(mocks.kanbanApi.getBoard.mock.calls.map(([id]) => id)).toEqual(['1', '2']);
  });

  it('apresenta projeto inexistente em fallback recuperável', async () => {
    mocks.api.get.mockRejectedValueOnce({
      response: { status: 404, data: { code: 'PROJECT_NOT_FOUND' } }
    });
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Página não encontrada.' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar ao projeto' })).toHaveAttribute(
      'href',
      '/projects/1'
    );
  });
});

// ADR-011: o recorte de Sprint permanece na URL. UX-PLANNING-06 concentra a
// alteração de status no arrasto e deixa detalhes e histórico como consulta.
describe('KanbanPage ADR-011', () => {
  const sprintAtiva = {
    id: 4,
    name: 'Sprint 4',
    objective: 'Andamento no Kanban',
    startDate: '2026-08-10T00:00:00',
    endDate: '2026-08-21T00:00:00',
    status: 'EM_ANDAMENTO',
    milestoneId: 2
  };
  const sprintCongelada = {
    id: 3,
    name: 'Sprint 3',
    objective: null,
    startDate: '2026-07-27T00:00:00',
    endDate: '2026-08-08T00:00:00',
    status: 'CONCLUIDA',
    milestoneId: 2
  };
  const daSprint = {
    ...task,
    id: 8,
    title: 'Da sprint',
    description: 'Implementar login seguro',
    priority: 'ALTA',
    sprintId: 4,
    estimatedEffort: 5,
    deadline: '2026-12-10'
  };
  const congelada = {
    ...task,
    id: 9,
    title: 'Congelada',
    priority: 'BAIXA',
    sprintId: 3,
    responsibleUser: { id: 6, name: 'Outra pessoa' },
    deadline: '2026-01-10'
  };
  const doBacklog = { ...task, id: 10, title: 'Do backlog', sprintId: null };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.api.get.mockResolvedValue({ data: { project: { id: 1, name: 'Projeto' } } });
    mocks.kanbanApi.getBoard.mockResolvedValue({
      data: {
        columns: { A_FAZER: [daSprint, congelada, doBacklog], EM_ANDAMENTO: [], CONCLUIDO: [] },
        totals: { A_FAZER: 3, EM_ANDAMENTO: 0, CONCLUIDO: 0, total: 3 }
      }
    });
    mocks.kanbanApi.getMetrics.mockResolvedValue({
      data: { indicator: 'MOVIMENTACOES', metric: 'Movimentações', totalMovements: 4 }
    });
    mocks.kanbanApi.listTaskHistory.mockResolvedValue(historyResponse());
    mocks.membersApi.list.mockResolvedValue({
      currentMembership: { id: 1, role: 'MEMBER', isActive: true },
      members: [
        { id: 1, userId: 5, isActive: true, user: { id: 5, name: 'Responsável real' } },
        { id: 2, userId: 6, isActive: true, user: { id: 6, name: 'Outra pessoa' } }
      ]
    });
    mocks.scheduleApi.listSprints.mockResolvedValue({
      data: { total: 2, sprints: [sprintCongelada, sprintAtiva] }
    });
    mocks.requirementsApi.listByProject.mockResolvedValue({ data: { requirements: [] } });
    mocks.githubApi.getProjectPullRequests.mockResolvedValue({ pullRequests: [] });
    mocks.githubApi.getProjectCommits.mockResolvedValue({ commits: [] });
    mocks.githubApi.getProjectIssues.mockResolvedValue({ issues: [] });
    mocks.tasksApi.update.mockImplementation(async (id, payload) => ({
      data: {
        message: 'Tarefa atualizada com sucesso.',
        task: { ...(id === daSprint.id ? daSprint : congelada), ...payload, id }
      }
    }));
    mocks.kanbanApi.moveTask.mockImplementation(async (id, { toStatus }) => ({
      data: {
        message: 'Tarefa movida com sucesso.',
        task: { ...daSprint, id, status: toStatus }
      }
    }));
  });

  it('conta as tarefas visiveis, e nao as do projeto inteiro', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Da sprint');

    expect(screen.getByRole('heading', { name: 'Visão geral do Kanban' })).toBeInTheDocument();
    expect(screen.getByText('Projeto inteiro')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Voltar para o projeto/ })).toBeNull();
    const summaryRegion = screen.getByRole('region', { name: 'Visão geral do Kanban' });
    expect(within(summaryRegion).getByText('Prioridade crítica')).toBeInTheDocument();
    expect(within(summaryRegion).getByText('Atrasadas')).toBeInTheDocument();
    expect(within(summaryRegion).getByText('Sem rastreabilidade')).toBeInTheDocument();
    expect(within(summaryRegion).queryByText('A fazer', { exact: false })).toBeNull();
    expect(within(summaryRegion).queryByText('Em andamento', { exact: false })).toBeNull();
    expect(within(summaryRegion).queryByText('Concluídas')).toBeNull();

    await user.click(screen.getByRole('button', { name: /Projeto inteiro/ }));
    await user.click(screen.getByRole('checkbox', { name: /Sprint 4/ }));

    // Com filtro, o backlog sai do quadro: quem filtra por sprint esta
    // perguntando sobre o que esta em execucao.
    await waitFor(() => expect(screen.queryByText('Do backlog')).toBeNull());
    expect(screen.getByText('Da sprint')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'A Fazer' })).toBeInTheDocument();
    expect(screen.getByLabelText('1 tarefa')).toBeInTheDocument();
  });

  it('resume o filtro por extenso e permite limpa-lo', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Da sprint');

    await user.click(screen.getByRole('button', { name: /Projeto inteiro/ }));
    await user.click(screen.getByRole('checkbox', { name: /Sprint 4/ }));

    expect(await screen.findByRole('button', { name: /Sprint 4/ })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /Projeto inteiro/ }));
    expect(await screen.findByRole('button', { name: /Projeto inteiro/ })).toBeInTheDocument();
  });

  it('a sprint marcada no filtro identifica o estado congelado', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Da sprint');

    await user.click(screen.getByRole('button', { name: /Projeto inteiro/ }));
    expect(
      screen.getByRole('checkbox', { name: /Sprint 3.*Concluída.*congelada/ })
    ).toBeInTheDocument();
  });

  it('abre detalhes pelo teclado, mostra status somente leitura e retorna o foco', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Da sprint');

    const cartao = screen.getByRole('button', { name: 'Abrir detalhes de Da sprint' });
    cartao.focus();
    await user.keyboard('{Enter}');
    const dialogo = screen.getByRole('dialog', { name: /#8 Da sprint/ });
    expect(within(dialogo).queryByRole('combobox')).toBeNull();
    expect(within(dialogo).getByText('A Fazer')).toBeInTheDocument();
    expect(mocks.kanbanApi.moveTask).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(within(dialogo).getByRole('button', { name: 'Fechar #8 da sprint' })).toHaveFocus()
    );
    await user.keyboard('{Escape}');
    await waitFor(() => expect(cartao).toHaveFocus());
  });

  it('bloqueia o arrasto de tarefa em Sprint congelada', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Congelada');

    expect(screen.getByText('Sprint congelada')).toBeInTheDocument();
    const cartao = screen.getByRole('button', { name: 'Abrir detalhes de Congelada' });
    expect(cartao).toHaveAttribute('draggable', 'false');

    await user.click(cartao);
    const dialogo = screen.getByRole('dialog', { name: /#9 Congelada/ });
    expect(within(dialogo).queryByRole('combobox')).toBeNull();
  });

  it('mostra Sprint no cartão apenas no recorte do projeto inteiro', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Da sprint');
    const cartao = screen.getByRole('button', { name: 'Abrir detalhes de Da sprint' });
    expect(within(cartao).getByRole('note', { name: 'Sprint: Sprint 4' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('button', { name: 'Abrir detalhes de Do backlog' })).getByRole(
        'note',
        { name: 'Sem Sprint' }
      )
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Projeto inteiro/ }));
    await user.click(screen.getByRole('checkbox', { name: /Sprint 4/ }));
    expect(
      within(screen.getByRole('button', { name: 'Abrir detalhes de Da sprint' })).queryByRole(
        'note',
        { name: 'Sprint: Sprint 4' }
      )
    ).toBeNull();
  });

  it('mantém o histórico global fora da página e expõe a ação individual', async () => {
    renderPage();
    await screen.findByText('Da sprint');
    expect(screen.queryByRole('heading', { name: 'Histórico de tarefas' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Ver histórico da tarefa Da sprint' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mais ações/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Excluir tarefa' })).toBeNull();
  });

  it('não abre detalhes ao concluir um arrasto e abre no clique seguinte', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Da sprint');
    const card = screen.getByRole('button', { name: 'Abrir detalhes de Da sprint' });
    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: vi.fn(),
      getData: vi.fn(() => String(daSprint.id))
    };

    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.drop(screen.getByRole('heading', { name: 'Em Andamento' }).closest('section'), {
      dataTransfer
    });
    fireEvent.dragEnd(card, { dataTransfer });
    fireEvent.click(card);
    expect(screen.queryByRole('dialog', { name: /#8 Da sprint/ })).toBeNull();

    await waitFor(() => expect(mocks.kanbanApi.moveTask).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Abrir detalhes de Da sprint' }));
    expect(screen.getByRole('dialog', { name: /#8 Da sprint/ })).toBeInTheDocument();
  });

  it('edita campos suportados no próprio details e mantém status somente leitura', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Abrir detalhes de Da sprint' }));
    await user.click(screen.getByRole('button', { name: 'Editar tarefa' }));

    const title = screen.getByRole('textbox', { name: 'Título da tarefa' });
    expect(title).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Editar rastreabilidade' })).toBeNull();
    expect(screen.getByRole('searchbox', { name: 'Pesquisar requisito' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Status' })).toBeNull();
    expect(screen.getByText('Altere o status diretamente no quadro.')).toBeInTheDocument();
    await user.clear(title);
    await user.type(title, 'Da sprint revisada');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() =>
      expect(mocks.tasksApi.update).toHaveBeenCalledWith(8, { title: 'Da sprint revisada' })
    );
    expect(mocks.tasksApi.update.mock.calls[0][1]).not.toHaveProperty('status');
    expect(mocks.tasksApi.update.mock.calls[0][1]).not.toHaveProperty('sprintId');
    expect(await screen.findByText('Tarefa atualizada com sucesso.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar tarefa' })).toBeInTheDocument();
  });

  it('salva dados e rastreabilidade pelo mesmo modo de edição', async () => {
    const user = userEvent.setup();
    const requirement = { id: 71, title: 'RF integrado', status: 'APROVADO' };
    mocks.requirementsApi.listByProject.mockResolvedValue({
      data: { requirements: [requirement] }
    });
    mocks.tasksApi.update.mockResolvedValue({
      data: { task: { ...daSprint, title: 'Da sprint integrada' } }
    });
    mocks.linkTaskRequirement.mockResolvedValue({
      task: { ...daSprint, title: 'Da sprint integrada', requirement }
    });

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Abrir detalhes de Da sprint' }));
    await user.click(screen.getByRole('button', { name: 'Editar tarefa' }));
    await user.clear(screen.getByRole('textbox', { name: 'Título da tarefa' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Título da tarefa' }),
      'Da sprint integrada'
    );
    await user.type(screen.getByRole('searchbox', { name: 'Pesquisar requisito' }), 'RF');
    await user.click(await screen.findByRole('button', { name: 'RF integrado' }));
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() =>
      expect(mocks.tasksApi.update).toHaveBeenCalledWith(8, { title: 'Da sprint integrada' })
    );
    expect(mocks.linkTaskRequirement).toHaveBeenCalledWith(8, 71);
    expect(await screen.findByText('Tarefa atualizada com sucesso.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar tarefa' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar rastreabilidade' })).toBeNull();
  });

  it('cancela edição suja somente após confirmação e não envia mutation', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Abrir detalhes de Da sprint' }));
    await user.click(screen.getByRole('button', { name: 'Editar tarefa' }));
    await user.type(screen.getByRole('textbox', { name: 'Título da tarefa' }), ' alterada');
    await user.click(screen.getByRole('button', { name: 'Cancelar edição' }));

    const confirmation = screen.getByRole('dialog', { name: 'Descartar alterações?' });
    await user.click(within(confirmation).getByRole('button', { name: 'Descartar alterações' }));
    expect(mocks.tasksApi.update).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Editar tarefa' })).toHaveFocus()
    );
  });

  it('protege fechamento por Escape quando há alterações não salvas', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Abrir detalhes de Da sprint' }));
    await user.click(screen.getByRole('button', { name: 'Editar tarefa' }));
    await user.type(screen.getByRole('textbox', { name: 'Título da tarefa' }), ' alterada');
    await user.keyboard('{Escape}');

    const confirmation = screen.getByRole('dialog', { name: 'Descartar alterações?' });
    await user.click(within(confirmation).getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeInTheDocument();
    expect(mocks.tasksApi.update).not.toHaveBeenCalled();
  });

  it('mantém edição aberta e apresenta validação quando o save falha', async () => {
    const user = userEvent.setup();
    mocks.tasksApi.update.mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          message: 'Dados inválidos.',
          details: [{ field: 'body.title', message: 'Título inválido.' }]
        }
      }
    });
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Abrir detalhes de Da sprint' }));
    await user.click(screen.getByRole('button', { name: 'Editar tarefa' }));
    await user.type(screen.getByRole('textbox', { name: 'Título da tarefa' }), ' alterada');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(await screen.findByText('Dados inválidos.')).toBeInTheDocument();
    expect(screen.getByText('Título inválido.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeInTheDocument();
  });

  it('separa sucesso da mutation de falha posterior de reconciliação', async () => {
    const user = userEvent.setup();
    mocks.kanbanApi.getBoard
      .mockResolvedValueOnce({
        data: {
          columns: { A_FAZER: [daSprint, congelada, doBacklog], EM_ANDAMENTO: [], CONCLUIDO: [] },
          totals: { A_FAZER: 3, EM_ANDAMENTO: 0, CONCLUIDO: 0, total: 3 }
        }
      })
      .mockRejectedValueOnce({ response: { status: 503 } });
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Abrir detalhes de Da sprint' }));
    await user.click(screen.getByRole('button', { name: 'Editar tarefa' }));
    await user.type(screen.getByRole('textbox', { name: 'Título da tarefa' }), ' alterada');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(await screen.findByText('Tarefa atualizada com sucesso.')).toBeInTheDocument();
    expect(
      await screen.findByText(
        'O serviço está temporariamente indisponível. Tente novamente em instantes.'
      )
    ).toBeInTheDocument();
  });

  it('não expõe editar nem excluir para VIEWER', async () => {
    const user = userEvent.setup();
    mocks.membersApi.list.mockResolvedValueOnce({
      currentMembership: { id: 1, role: 'VIEWER', isActive: true },
      members: []
    });
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Abrir detalhes de Da sprint' }));
    expect(screen.queryByRole('button', { name: 'Editar tarefa' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Editar rastreabilidade' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Excluir tarefa' })).toBeNull();
  });

  it('edita todos os vínculos suportados com buscas dinâmicas dentro do details', async () => {
    const user = userEvent.setup();
    const requirement = { id: 81, title: 'Login seguro', status: 'APROVADO' };
    const pullRequest = {
      id: 82,
      number: 17,
      title: 'Implementar login',
      state: 'open',
      githubUrl: 'https://github.com/example/pull/17'
    };
    const commit = {
      id: 83,
      hash: 'abc123456789',
      shortHash: 'abc1234',
      message: 'Implementa login'
    };
    const issue = { id: 84, number: 31, title: 'Login pendente', state: 'open' };
    mocks.requirementsApi.listByProject.mockResolvedValue({
      data: { requirements: [requirement] }
    });
    mocks.githubApi.getProjectPullRequests.mockResolvedValue({ pullRequests: [pullRequest] });
    mocks.githubApi.getProjectCommits.mockResolvedValue({ commits: [commit] });
    mocks.githubApi.getProjectIssues.mockResolvedValue({ issues: [issue] });
    mocks.linkTaskRequirement.mockResolvedValue({
      task: { ...daSprint, requirement, pullRequest: null, commits: [], issues: [] }
    });
    mocks.linkTaskToPullRequest.mockResolvedValue({
      task: { ...daSprint, requirement, pullRequest, commits: [], issues: [] }
    });
    mocks.linkTaskCommit.mockResolvedValue({ commits: [commit] });
    mocks.linkTaskIssue.mockResolvedValue({ issues: [issue] });

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Abrir detalhes de Da sprint' }));
    await user.click(screen.getByRole('button', { name: 'Editar tarefa' }));

    expect(screen.queryByRole('button', { name: 'Editar tarefa' })).toBeNull();
    const requirementSearch = screen.getByRole('searchbox', { name: 'Pesquisar requisito' });
    expect(screen.getByRole('textbox', { name: 'Título da tarefa' })).toHaveFocus();
    await user.type(requirementSearch, 'login');
    await user.click(await screen.findByRole('button', { name: 'Login seguro' }));
    await user.type(screen.getByRole('searchbox', { name: 'Pesquisar pull request' }), '17');
    await user.click(await screen.findByRole('button', { name: '#17 — Implementar login' }));
    await user.type(screen.getByRole('searchbox', { name: 'Pesquisar commits' }), 'abc');
    await user.click(await screen.findByRole('button', { name: 'abc1234 — Implementa login' }));
    await user.type(screen.getByRole('searchbox', { name: 'Pesquisar issues' }), '31');
    await user.click(await screen.findByRole('button', { name: '#31 — Login pendente' }));

    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(mocks.linkTaskRequirement).toHaveBeenCalledWith(8, 81));
    expect(mocks.linkTaskToPullRequest).toHaveBeenCalledWith(8, 82);
    expect(mocks.linkTaskCommit).toHaveBeenCalledWith(8, 83);
    expect(mocks.linkTaskIssue).toHaveBeenCalledWith(8, 84);
    expect(await screen.findByText('Tarefa atualizada com sucesso.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar tarefa' })).toBeInTheDocument();
  });

  it('preserva vínculos atuais, protege cancelamento sujo e não envia mutations', async () => {
    const user = userEvent.setup();
    const linkedRequirement = { id: 91, title: 'RF atual', status: 'APROVADO' };
    const linkedTask = { ...daSprint, requirement: linkedRequirement, commits: [], issues: [] };
    mocks.kanbanApi.getBoard.mockResolvedValue({
      data: {
        columns: { A_FAZER: [linkedTask], EM_ANDAMENTO: [], CONCLUIDO: [] },
        totals: { A_FAZER: 1, EM_ANDAMENTO: 0, CONCLUIDO: 0, total: 1 }
      }
    });

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Abrir detalhes de Da sprint' }));
    await user.click(screen.getByRole('button', { name: 'Editar tarefa' }));
    await user.type(screen.getByRole('textbox', { name: 'Título da tarefa' }), ' alterada');
    expect(screen.getByText('RF atual')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remover requisito vinculado' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar edição' }));

    const confirmation = screen.getByRole('dialog', { name: 'Descartar alterações?' });
    await user.click(within(confirmation).getByRole('button', { name: 'Descartar alterações' }));
    expect(mocks.unlinkTaskRequirement).not.toHaveBeenCalled();
    expect(mocks.tasksApi.update).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Editar tarefa' })).toHaveFocus()
    );
    expect(screen.getByText('Implementar login seguro')).toBeInTheDocument();
  });

  it('remove requisito, pull request, commit e issue pelos contratos existentes', async () => {
    const user = userEvent.setup();
    const requirement = { id: 121, title: 'RF removível', status: 'APROVADO' };
    const pullRequest = { id: 122, number: 52, title: 'PR removível' };
    const commit = { id: 123, shortHash: 'c0ffee1', message: 'Commit removível' };
    const issue = { id: 124, number: 53, title: 'Issue removível' };
    const linkedTask = {
      ...daSprint,
      requirement,
      pullRequest,
      commits: [commit],
      issues: [issue]
    };
    mocks.kanbanApi.getBoard.mockResolvedValue({
      data: {
        columns: { A_FAZER: [linkedTask], EM_ANDAMENTO: [], CONCLUIDO: [] },
        totals: { A_FAZER: 1, EM_ANDAMENTO: 0, CONCLUIDO: 0, total: 1 }
      }
    });
    mocks.unlinkTaskRequirement.mockResolvedValue({
      task: { ...linkedTask, requirement: null }
    });
    mocks.unlinkTaskFromPullRequest.mockResolvedValue({
      task: { ...linkedTask, requirement: null, pullRequest: null }
    });
    mocks.unlinkTaskCommit.mockResolvedValue({ commits: [] });
    mocks.unlinkTaskIssue.mockResolvedValue({ issues: [] });

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Abrir detalhes de Da sprint' }));
    await user.click(screen.getByRole('button', { name: 'Editar tarefa' }));
    await user.click(screen.getByRole('button', { name: 'Remover requisito vinculado' }));
    await user.click(screen.getByRole('button', { name: 'Remover pull request vinculado' }));
    await user.click(screen.getByRole('button', { name: /Remover commit vinculado c0ffee1/ }));
    await user.click(screen.getByRole('button', { name: /Remover issue vinculada #53/ }));
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(mocks.unlinkTaskRequirement).toHaveBeenCalledWith(8));
    expect(mocks.unlinkTaskFromPullRequest).toHaveBeenCalledWith(8);
    expect(mocks.unlinkTaskCommit).toHaveBeenCalledWith(8, 123);
    expect(mocks.unlinkTaskIssue).toHaveBeenCalledWith(8, 124);
    expect(await screen.findByText('Tarefa atualizada com sucesso.')).toBeInTheDocument();
  });

  it('mantém somente o resultado da busca de requisito mais recente', async () => {
    const user = userEvent.setup();
    const oldRequest = deferred();
    mocks.requirementsApi.listByProject
      .mockReturnValueOnce(oldRequest.promise)
      .mockResolvedValueOnce({ data: { requirements: [{ id: 102, title: 'Login atual' }] } });

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Abrir detalhes de Da sprint' }));
    await user.click(screen.getByRole('button', { name: 'Editar tarefa' }));
    const search = screen.getByRole('searchbox', { name: 'Pesquisar requisito' });
    await user.type(search, 'lo');
    await waitFor(() => expect(mocks.requirementsApi.listByProject).toHaveBeenCalledTimes(1));
    await user.clear(search);
    await user.type(search, 'login');
    expect(await screen.findByRole('button', { name: 'Login atual' })).toBeInTheDocument();

    await act(async () => {
      oldRequest.resolve({ data: { requirements: [{ id: 101, title: 'Resultado antigo' }] } });
      await Promise.resolve();
    });
    expect(screen.queryByRole('button', { name: 'Resultado antigo' })).toBeNull();
  });

  it('preserva sucesso parcial sem alegar atomicidade', async () => {
    const user = userEvent.setup();
    const requirement = { id: 111, title: 'RF confirmado', status: 'APROVADO' };
    const pullRequest = { id: 112, number: 44, title: 'PR indisponível' };
    mocks.requirementsApi.listByProject.mockResolvedValue({
      data: { requirements: [requirement] }
    });
    mocks.githubApi.getProjectPullRequests.mockResolvedValue({ pullRequests: [pullRequest] });
    mocks.linkTaskRequirement.mockResolvedValue({
      task: { ...daSprint, requirement, pullRequest: null, commits: [], issues: [] }
    });
    mocks.linkTaskToPullRequest.mockRejectedValue({ response: { status: 503 } });

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Abrir detalhes de Da sprint' }));
    await user.click(screen.getByRole('button', { name: 'Editar tarefa' }));
    await user.type(screen.getByRole('searchbox', { name: 'Pesquisar requisito' }), 'RF');
    await user.click(await screen.findByRole('button', { name: 'RF confirmado' }));
    await user.type(screen.getByRole('searchbox', { name: 'Pesquisar pull request' }), '44');
    await user.click(await screen.findByRole('button', { name: '#44 — PR indisponível' }));
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(
      await screen.findByText('As alterações confirmadas foram atualizadas.')
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/Algumas alterações não puderam ser atualizadas/)
    ).toBeInTheDocument();
    expect(screen.getByText('RF confirmado')).toBeInTheDocument();
    expect(screen.queryByText('PR indisponível')).toBeNull();
  });

  it('reflete vínculo confirmado quando os dados da tarefa falham', async () => {
    const user = userEvent.setup();
    const requirement = { id: 119, title: 'RF persistido parcialmente', status: 'APROVADO' };
    mocks.requirementsApi.listByProject.mockResolvedValue({
      data: { requirements: [requirement] }
    });
    mocks.tasksApi.update.mockRejectedValue({ response: { status: 503 } });
    mocks.linkTaskRequirement.mockResolvedValue({ task: { ...daSprint, requirement } });

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Abrir detalhes de Da sprint' }));
    await user.click(screen.getByRole('button', { name: 'Editar tarefa' }));
    await user.type(screen.getByRole('textbox', { name: 'Título da tarefa' }), ' alterada');
    await user.type(screen.getByRole('searchbox', { name: 'Pesquisar requisito' }), 'RF');
    await user.click(await screen.findByRole('button', { name: 'RF persistido parcialmente' }));
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(
      await screen.findByText('As alterações confirmadas foram atualizadas.')
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/Algumas alterações não puderam ser atualizadas/)
    ).toBeInTheDocument();
    expect(screen.getByText('RF persistido parcialmente')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar tarefa' })).toBeInTheDocument();
  });

  it('sempre reabre a mesma tarefa em modo de leitura após descartar o draft', async () => {
    const user = userEvent.setup();
    renderPage();
    const card = await screen.findByRole('button', { name: 'Abrir detalhes de Da sprint' });
    await user.click(card);
    await user.click(screen.getByRole('button', { name: 'Editar tarefa' }));
    await user.type(screen.getByRole('textbox', { name: 'Título da tarefa' }), ' alterada');
    await user.click(screen.getByRole('button', { name: 'Fechar #8 da sprint' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Descartar alterações?' })).getByRole('button', {
        name: 'Descartar alterações'
      })
    );

    await waitFor(() => expect(screen.queryByRole('dialog', { name: /#8/ })).toBeNull());
    await user.click(card);
    expect(screen.getByRole('button', { name: 'Editar tarefa' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Título da tarefa' })).toBeNull();
    expect(screen.getByText('Implementar login seguro')).toBeInTheDocument();
  });

  it('não reutiliza modo ou draft ao fechar uma tarefa e abrir outra', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Abrir detalhes de Da sprint' }));
    await user.click(screen.getByRole('button', { name: 'Editar tarefa' }));
    await user.click(screen.getByRole('button', { name: 'Fechar #8 da sprint' }));

    await user.click(screen.getByRole('button', { name: 'Abrir detalhes de Do backlog' }));
    expect(screen.getByRole('dialog', { name: /#10 Do backlog/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar tarefa' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Título da tarefa' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Fechar #10 do backlog' }));
    await user.click(screen.getByRole('button', { name: 'Abrir detalhes de Da sprint' }));
    expect(screen.getByRole('button', { name: 'Editar tarefa' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Título da tarefa' })).toBeNull();
  });

  it('ignora busca pendente da tarefa fechada ao abrir outra', async () => {
    const user = userEvent.setup();
    const oldRequest = deferred();
    mocks.requirementsApi.listByProject.mockReturnValueOnce(oldRequest.promise);
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Abrir detalhes de Da sprint' }));
    await user.click(screen.getByRole('button', { name: 'Editar tarefa' }));
    await user.type(screen.getByRole('searchbox', { name: 'Pesquisar requisito' }), 'lo');
    await waitFor(() => expect(mocks.requirementsApi.listByProject).toHaveBeenCalledOnce());
    await user.click(screen.getByRole('button', { name: 'Fechar #8 da sprint' }));
    await user.click(screen.getByRole('button', { name: 'Abrir detalhes de Do backlog' }));

    await act(async () => {
      oldRequest.resolve({ data: { requirements: [{ id: 777, title: 'Resultado da Task A' }] } });
      await Promise.resolve();
    });
    expect(screen.queryByText('Resultado da Task A')).toBeNull();
    expect(screen.getByRole('button', { name: 'Editar tarefa' })).toBeInTheDocument();
  });

  it('não reclassifica mutation confirmada quando a reconciliação falha', async () => {
    const user = userEvent.setup();
    const requirement = { id: 131, title: 'RF persistido', status: 'APROVADO' };
    mocks.kanbanApi.getBoard
      .mockResolvedValueOnce({
        data: {
          columns: { A_FAZER: [daSprint], EM_ANDAMENTO: [], CONCLUIDO: [] },
          totals: { A_FAZER: 1, EM_ANDAMENTO: 0, CONCLUIDO: 0, total: 1 }
        }
      })
      .mockRejectedValueOnce({ response: { status: 503 } });
    mocks.requirementsApi.listByProject.mockResolvedValue({
      data: { requirements: [requirement] }
    });
    mocks.linkTaskRequirement.mockResolvedValue({
      task: { ...daSprint, requirement, commits: [], issues: [] }
    });

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Abrir detalhes de Da sprint' }));
    await user.click(screen.getByRole('button', { name: 'Editar tarefa' }));
    await user.type(screen.getByRole('searchbox', { name: 'Pesquisar requisito' }), 'RF');
    await user.click(await screen.findByRole('button', { name: 'RF persistido' }));
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(await screen.findByText('Tarefa atualizada com sucesso.')).toBeInTheDocument();
    expect(
      await screen.findByText(
        'O serviço está temporariamente indisponível. Tente novamente em instantes.'
      )
    ).toBeInTheDocument();
  });

  it('mantém filtros recolhidos, filtra localmente e preserva o resumo da Sprint', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Da sprint');

    const toggle = screen.getByRole('button', { name: /Buscar e filtrar/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    await user.type(screen.getByLabelText('Pesquisar'), 'login');

    expect(await screen.findByText('1 de 3 tarefas exibidas')).toBeInTheDocument();
    expect(screen.getByText('Da sprint')).toBeInTheDocument();
    expect(screen.queryByText('Congelada')).toBeNull();
    const summaryRegion = screen.getByRole('region', { name: 'Visão geral do Kanban' });
    expect(within(summaryRegion).getByText('Total').parentElement).toHaveTextContent('3');
    expect(toggle).toHaveTextContent('1 filtro ativo');

    await user.selectOptions(screen.getByLabelText('Responsável'), '6');
    expect(await screen.findByText('Nenhuma tarefa corresponde aos filtros.')).toBeInTheDocument();
    expect(toggle).toHaveTextContent('2 filtros ativos');

    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(await screen.findByText('Do backlog')).toBeInTheDocument();
    expect(toggle).toHaveTextContent('0 ativos');
  });

  it('combina prioridade e intervalo de prazo sem alterar o universo do resumo', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Da sprint');
    await user.click(screen.getByRole('button', { name: /Buscar e filtrar/ }));
    await user.selectOptions(screen.getByLabelText('Prioridade'), 'ALTA');
    await user.type(screen.getByLabelText('Prazo inicial'), '2026-12-01');
    await user.type(screen.getByLabelText('Prazo final'), '2026-12-31');

    expect(await screen.findByText('1 de 3 tarefas exibidas')).toBeInTheDocument();
    expect(screen.getByText('Da sprint')).toBeInTheDocument();
    expect(screen.queryByText('Congelada')).toBeNull();
  });
});

describe('current-context-wins na troca de projeto', () => {
  const tarefaDeA = { ...task, id: 21, title: 'Tarefa do A' };
  const tarefaDeB = { ...task, id: 22, title: 'Tarefa do B' };
  const sprintDeA = {
    id: 41,
    name: 'Sprint do A',
    status: 'EM_ANDAMENTO',
    startDate: '2026-08-01',
    endDate: '2026-08-14'
  };
  const sprintDeB = {
    id: 42,
    name: 'Sprint do B',
    status: 'EM_ANDAMENTO',
    startDate: '2026-08-01',
    endDate: '2026-08-14'
  };

  const quadroCom = (tarefa) => ({
    columns: { A_FAZER: [tarefa], EM_ANDAMENTO: [], CONCLUIDO: [] },
    totals: { A_FAZER: 1, EM_ANDAMENTO: 0, CONCLUIDO: 0, total: 1 }
  });

  function deferred() {
    let resolve;
    const promise = new Promise((resolver) => {
      resolve = resolver;
    });
    return { promise, resolve };
  }

  function responderCom(nome, tarefa, sprint) {
    mocks.api.get.mockResolvedValue({ data: { project: { id: 2, name: nome } } });
    mocks.kanbanApi.getBoard.mockResolvedValue({ data: quadroCom(tarefa) });
    mocks.kanbanApi.getMetrics.mockResolvedValue({
      data: { indicator: 'MOVIMENTACOES', metric: 'Movimentações', totalMovements: 0 }
    });
    mocks.kanbanApi.listTaskHistory.mockResolvedValue(historyResponse());
    mocks.membersApi.list.mockResolvedValue({
      currentMembership: { id: 1, role: 'MEMBER', isActive: true },
      members: []
    });
    mocks.scheduleApi.listSprints.mockResolvedValue({ data: { total: 1, sprints: [sprint] } });
  }

  function TrocarProjeto() {
    const navigate = useNavigate();
    return (
      <button type="button" onClick={() => navigate('/projects/2/kanban')}>
        Ir para o projeto 2
      </button>
    );
  }

  function renderComTroca() {
    return render(
      <MemoryRouter initialEntries={['/projects/1/kanban']}>
        <TrocarProjeto />
        <Routes>
          <Route
            path="/projects/:projectId/kanban"
            element={
              <ConfirmProvider>
                <KanbanPage />
              </ConfirmProvider>
            }
          />
        </Routes>
      </MemoryRouter>
    );
  }

  it('resposta do projeto anterior nao sobrescreve quadro, catalogo nem filtro', async () => {
    const user = userEvent.setup();
    const atrasada = deferred();
    const doA = (valor) => atrasada.promise.then(() => valor);

    mocks.api.get.mockReturnValue(doA({ data: { project: { id: 1, name: 'Projeto A' } } }));
    mocks.kanbanApi.getBoard.mockReturnValue(doA({ data: quadroCom(tarefaDeA) }));
    mocks.kanbanApi.getMetrics.mockReturnValue(
      doA({ data: { indicator: 'MOVIMENTACOES', metric: 'Movimentações', totalMovements: 9 } })
    );
    mocks.kanbanApi.listTaskHistory.mockReturnValue(doA(historyResponse()));
    mocks.membersApi.list.mockReturnValue(
      doA({ currentMembership: { id: 1, role: 'MEMBER', isActive: true }, members: [] })
    );
    mocks.scheduleApi.listSprints.mockReturnValue(
      doA({ data: { total: 1, sprints: [sprintDeA] } })
    );

    renderComTroca();
    responderCom('Projeto B', tarefaDeB, sprintDeB);
    await user.click(screen.getByRole('button', { name: 'Ir para o projeto 2' }));
    await screen.findByText('Tarefa do B');

    atrasada.resolve();
    await waitFor(() => expect(screen.getByText('Tarefa do B')).toBeInTheDocument());

    expect(screen.queryByText('Tarefa do A')).toBeNull();

    await user.click(screen.getByRole('button', { name: /Projeto inteiro/ }));
    expect(screen.getByRole('checkbox', { name: /Sprint do B/ })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Sprint do A/ })).toBeNull();
  });
});

describe('FIX-03 frozen Sprint Kanban', () => {
  const frozenTasks = ['A_FAZER', 'EM_ANDAMENTO', 'CONCLUIDO'].map((status, index) => ({
    id: index + 1,
    currentTaskId: index + 1,
    participationId: index + 10,
    title: `Snapshot T${index + 1}`,
    status,
    sprintId: 1,
    isFrozen: true,
    snapshotAvailable: true,
    snapshotAt: '2026-09-04T12:00:00Z',
    estimatedEffort: [3, 5, 8][index],
    priority: 'MEDIA',
    responsibleUserId: 5,
    deadline: null,
    traceabilityCounts: { requirements: 0, pullRequests: 0, commits: 0, issues: 0 }
  }));
  const projection = {
    sprintId: 1,
    isFrozen: true,
    tasks: frozenTasks,
    historicalLimitations: [],
    historicalSummary: { totalTasks: 3, completedTasks: 1, totalPoints: 16, percentage: 50 }
  };
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.api.get.mockResolvedValue({ data: { project: { id: 1, name: 'Core' } } });
    mocks.membersApi.list.mockResolvedValue({ members: [], currentMembership: { role: 'OWNER' } });
    mocks.scheduleApi.listSprints.mockResolvedValue({
      data: {
        sprints: [
          { id: 1, name: 'S1', status: 'CONCLUIDA' },
          { id: 2, name: 'S2', status: 'EM_ANDAMENTO' }
        ]
      }
    });
    mocks.scheduleApi.listSprintTasks.mockResolvedValue({ data: projection });
    mocks.kanbanApi.getBoard.mockResolvedValue({
      data: {
        columns: {
          A_FAZER: [],
          EM_ANDAMENTO: [],
          CONCLUIDO: [{ ...task, title: 'Current T1', id: 1, sprintId: 2, estimatedEffort: 13 }]
        },
        totals: { total: 1 }
      }
    });
    mocks.tasksApi.get.mockResolvedValue({
      data: { task: { ...task, id: 1, title: 'Current T1', sprintId: 2, estimatedEffort: 13 } }
    });
  });
  it('renders all closing columns, frozen metrics, read-only details and explicit current details', async () => {
    const user = userEvent.setup();
    renderPage('/projects/1/kanban?sprint=1');
    await screen.findByText('Snapshot T1');
    for (const [i, label] of ['A Fazer', 'Em Andamento', 'Concluído'].entries()) {
      const column = screen.getByRole('heading', { name: label }).closest('section');
      expect(within(column).getByText(`Snapshot T${i + 1}`)).toBeInTheDocument();
      expect(within(column).getByLabelText('1 tarefa')).toBeInTheDocument();
    }
    expect(screen.getByText('Estado congelado no encerramento da Sprint.')).toBeInTheDocument();
    expect(screen.queryByText('Arraste uma tarefa para alterar sua etapa.')).toBeNull();
    const summary = screen.getByRole('region', { name: 'Visão geral do Kanban' });
    expect(within(summary).getByText('16')).toBeInTheDocument();
    expect(within(summary).queryByText('Atrasadas')).toBeNull();
    const card = screen.getByRole('button', { name: 'Abrir detalhes de Snapshot T1' });
    expect(card).toHaveAttribute('draggable', 'false');
    const transfer = { setData: vi.fn(), getData: () => '1' };
    fireEvent.dragStart(card, { dataTransfer: transfer });
    fireEvent.drop(screen.getByRole('heading', { name: 'Concluído' }).closest('section'), {
      dataTransfer: transfer
    });
    expect(mocks.kanbanApi.moveTask).not.toHaveBeenCalled();
    await user.click(card);
    const dialog = screen.getByRole('dialog', { name: 'Detalhes no encerramento' });
    expect(within(dialog).queryByRole('button', { name: 'Editar tarefa' })).toBeNull();
    expect(within(dialog).queryByRole('combobox')).toBeNull();
    expect(within(dialog).getByText('Responsável #5')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Abrir tarefa atual' }));
    expect(await screen.findByRole('dialog', { name: /#1 Current T1/ })).toBeInTheDocument();
    expect(mocks.tasksApi.get).toHaveBeenCalledWith(1);
    expect(screen.getByText('Snapshot T1')).toBeInTheDocument();
  });
  it('does not fall back to current cards when historical loading fails', async () => {
    mocks.scheduleApi.listSprintTasks.mockRejectedValueOnce({
      response: { status: 500, data: { message: 'Snapshot failure' } }
    });
    const user = userEvent.setup();
    renderPage('/projects/1/kanban?sprint=1');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O TRACEFLOW encontrou um problema interno.'
    );
    expect(screen.queryByText('Current T1')).toBeNull();
    mocks.scheduleApi.listSprintTasks.mockResolvedValueOnce({ data: projection });
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Snapshot T1')).toBeInTheDocument();
  });
  it('makes unknown legacy fields explicit and omits the current link for a deleted Task', async () => {
    mocks.scheduleApi.listSprintTasks.mockResolvedValue({
      data: {
        ...projection,
        historicalLimitations: ['LEGACY_CLOSING_TASK_SNAPSHOT_UNAVAILABLE'],
        tasks: [
          {
            ...frozenTasks[0],
            currentTaskId: null,
            snapshotAvailable: false,
            priority: null,
            traceabilityCounts: null
          }
        ]
      }
    });
    const user = userEvent.setup();
    renderPage('/projects/1/kanban?sprint=1');
    await user.click(await screen.findByRole('button', { name: 'Abrir detalhes de Snapshot T1' }));
    const dialog = screen.getByRole('dialog', { name: 'Detalhes no encerramento' });
    expect(
      within(dialog).getByText('Snapshot detalhado indisponível para esta Sprint histórica.')
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Abrir tarefa atual' })).toBeNull();
  });
});
