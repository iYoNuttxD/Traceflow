import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../../src/shared/index.js';

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn() },
  deleteTask: vi.fn(),
  kanbanApi: {
    getBoard: vi.fn(),
    getMetrics: vi.fn(),
    listTaskHistory: vi.fn(),
    moveTask: vi.fn()
  },
  membersApi: { list: vi.fn() },
  scheduleApi: { listSprints: vi.fn() }
}));

vi.mock('../../src/features/tasks/api/tasks.api.js', () => ({
  kanbanApi: mocks.kanbanApi,
  deleteTask: mocks.deleteTask,
  unlinkTaskCommit: vi.fn(),
  unlinkTaskIssue: vi.fn(),
  unlinkTaskFromPullRequest: vi.fn(),
  unlinkTaskRequirement: vi.fn()
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
      members: [{ id: 3, userId: 5, isActive: true, user: { id: 5, name: 'Responsável real' } }]
    });
    mocks.scheduleApi.listSprints.mockResolvedValue({ data: { total: 0, sprints: [] } });
    mocks.deleteTask.mockResolvedValue({ message: 'Tarefa excluída com sucesso.' });
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
      members: [
        { id: 1, userId: 5, isActive: true, user: { id: 5, name: 'Responsável real' } },
        { id: 2, userId: 6, isActive: true, user: { id: 6, name: 'Outra pessoa' } }
      ]
    });
    mocks.scheduleApi.listSprints.mockResolvedValue({
      data: { total: 2, sprints: [sprintCongelada, sprintAtiva] }
    });
  });

  it('conta as tarefas visiveis, e nao as do projeto inteiro', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Da sprint');

    expect(screen.getByRole('heading', { name: 'Resumo' })).toBeInTheDocument();
    expect(screen.getByText('Projeto inteiro')).toBeInTheDocument();

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
    await user.click(screen.getByRole('button', { name: 'Projeto inteiro' }));
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
    expect(within(cartao).getByText('Sprint 4')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Projeto inteiro/ }));
    await user.click(screen.getByRole('checkbox', { name: /Sprint 4/ }));
    expect(
      within(screen.getByRole('button', { name: 'Abrir detalhes de Da sprint' })).queryByText(
        'Sprint 4'
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
    const summaryRegion = screen.getByRole('region', { name: 'Resumo' });
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
    mocks.membersApi.list.mockResolvedValue({ members: [] });
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
    mocks.membersApi.list.mockReturnValue(doA({ members: [] }));
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
