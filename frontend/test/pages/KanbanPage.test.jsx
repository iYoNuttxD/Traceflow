import { MemoryRouter, Route, Routes } from 'react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../../src/shared/index.js';

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn() },
  kanbanApi: {
    getBoard: vi.fn(),
    getMetrics: vi.fn(),
    listTaskHistory: vi.fn(),
    moveTask: vi.fn()
  },
  projectMembersApi: { listProjectMembers: vi.fn() },
  scheduleApi: { listSprints: vi.fn() }
}));

vi.mock('../../src/features/tasks/api/tasks.api.js', () => ({
  kanbanApi: mocks.kanbanApi,
  deleteTask: vi.fn(),
  unlinkTaskCommit: vi.fn(),
  unlinkTaskIssue: vi.fn(),
  unlinkTaskFromPullRequest: vi.fn(),
  unlinkTaskRequirement: vi.fn()
}));
vi.mock('../../src/features/members/members.api.js', () => ({
  projectMembersApi: mocks.projectMembersApi
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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/projects/1/kanban']}>
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

function dragTaskTo(columnName) {
  const dataTransfer = {
    effectAllowed: '',
    dropEffect: '',
    setData: vi.fn(),
    getData: vi.fn(() => String(task.id))
  };
  fireEvent.dragStart(screen.getByRole('button', { name: /Tarefa E11/ }), { dataTransfer });
  fireEvent.drop(screen.getByRole('heading', { name: columnName }).closest('section'), {
    dataTransfer
  });
}

describe('KanbanPage E11', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.api.get.mockResolvedValue({ data: { project: { id: 1, name: 'Projeto E11' } } });
    mocks.kanbanApi.getBoard.mockResolvedValue({ data: board });
    mocks.kanbanApi.getMetrics.mockResolvedValue({
      data: { indicator: 'MOVIMENTACOES', metric: 'Movimentações', totalMovements: 0 }
    });
    mocks.kanbanApi.listTaskHistory.mockResolvedValue(historyResponse());
    mocks.projectMembersApi.listProjectMembers.mockResolvedValue({
      data: {
        members: [{ id: 3, userId: 5, isActive: true, user: { id: 5, name: 'Responsável real' } }]
      }
    });
    mocks.scheduleApi.listSprints.mockResolvedValue({ data: { total: 0, sprints: [] } });
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
    dragTaskTo('Em Andamento (0)');

    await waitFor(() =>
      expect(mocks.kanbanApi.moveTask).toHaveBeenCalledWith(7, {
        toStatus: 'EM_ANDAMENTO'
      })
    );
    expect(mocks.kanbanApi.moveTask.mock.calls[0][1]).not.toHaveProperty('movedBy');
    expect(mocks.kanbanApi.moveTask.mock.calls[0][1]).not.toHaveProperty('projectMemberId');
  });

  it('mantém o quadro coerente e recarrega os dados diante de conflito 409', async () => {
    mocks.kanbanApi.moveTask.mockRejectedValue({
      response: { status: 409, data: { message: 'A tarefa foi alterada por outra operação.' } }
    });
    renderPage();
    await screen.findByText('Tarefa E11');

    dragTaskTo('Em Andamento (0)');

    expect(
      await screen.findByText('A tarefa foi alterada por outra operação.')
    ).toBeInTheDocument();
    await waitFor(() => expect(mocks.kanbanApi.getBoard).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('heading', { name: 'A Fazer (1)' })).toBeInTheDocument();
  });

  it('pagina o histórico no backend e distingue sucesso vazio de erro', async () => {
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

    expect(await screen.findByText(/Status: A Fazer para Em Andamento/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Próxima' }));
    await waitFor(() =>
      expect(mocks.kanbanApi.listTaskHistory).toHaveBeenLastCalledWith('1', {
        page: 2,
        limit: 10
      })
    );
    expect(await screen.findByText(/Prioridade: Média para Alta/)).toBeInTheDocument();
  });
});

// ADR-011: o quadro passou a ser filtravel por sprint; a troca de status sem
// arrasto vive no painel de detalhes desde a quinta iteracao do design
// (docs/issues/RF10_RF08_PROMPT_QUINTA_ITERACAO.md). O painel de andamento
// saiu do Kanban no design de 30/08: a evolucao vive na tela de Sprints.
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
  const daSprint = { ...task, id: 8, title: 'Da sprint', sprintId: 4, estimatedEffort: 5 };
  const congelada = { ...task, id: 9, title: 'Congelada', sprintId: 3 };
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
    mocks.projectMembersApi.listProjectMembers.mockResolvedValue({ data: { members: [] } });
    mocks.scheduleApi.listSprints.mockResolvedValue({
      data: { total: 2, sprints: [sprintCongelada, sprintAtiva] }
    });
  });

  it('conta as tarefas visiveis, e nao as do projeto inteiro', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Da sprint');

    expect(screen.getByText('Tarefas no quadro')).toBeInTheDocument();
    expect(screen.getByText('de 3 tarefas no projeto')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Selecionar sprints' }));
    await user.click(screen.getByRole('checkbox', { name: /Sprint 4/ }));

    // Com filtro, o backlog sai do quadro: quem filtra por sprint esta
    // perguntando sobre o que esta em execucao.
    await waitFor(() => expect(screen.queryByText('Do backlog')).toBeNull());
    expect(screen.getByText('Da sprint')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'A Fazer (1)' })).toBeInTheDocument();
  });

  it('resume o filtro por extenso e permite limpa-lo', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Da sprint');

    expect(screen.getByText(/Sem filtro — exibindo todas as tarefas/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Selecionar sprints' }));
    await user.click(screen.getByRole('checkbox', { name: /Sprint 4/ }));

    expect(await screen.findByText(/Exibindo 1 sprint: Sprint 4\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Limpar filtro' }));
    expect(await screen.findByText(/Sem filtro/)).toBeInTheDocument();
  });

  it('a sprint marcada no filtro identifica o estado congelado', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Da sprint');

    await user.click(screen.getByRole('button', { name: 'Selecionar sprints' }));
    expect(
      screen.getByRole('checkbox', { name: /Sprint 3 · Concluída \(congelada\)/ })
    ).toBeInTheDocument();
  });

  // O cartao nao carrega mais seletor: a alternativa ao arrasto para teclado e
  // toque e o seletor do painel de detalhes, que abre por Enter no cartao.
  it('o cartao nao tem mais seletor de status', async () => {
    renderPage();
    await screen.findByText('Da sprint');

    const cartao = screen.getByRole('button', { name: /Da sprint/ });
    expect(within(cartao).queryByRole('combobox')).toBeNull();
  });

  it('move a tarefa pelo seletor do painel de detalhes, sem mouse', async () => {
    const user = userEvent.setup();
    mocks.kanbanApi.moveTask.mockResolvedValue({
      data: {
        message: 'Tarefa movida com sucesso.',
        task: { ...daSprint, status: 'EM_ANDAMENTO' },
        movement: { id: 1 }
      }
    });
    renderPage();
    await screen.findByText('Da sprint');

    const cartao = screen.getByRole('button', { name: /Da sprint/ });
    cartao.focus();
    await user.keyboard('{Enter}');

    const dialogo = screen.getByRole('dialog', { name: 'Da sprint' });
    const seletor = within(dialogo).getByRole('combobox', { name: 'Mover a tarefa Da sprint' });
    await user.selectOptions(seletor, 'EM_ANDAMENTO');

    await waitFor(() =>
      expect(mocks.kanbanApi.moveTask).toHaveBeenCalledWith(8, { toStatus: 'EM_ANDAMENTO' })
    );
    await waitFor(() => expect(seletor).toHaveValue('EM_ANDAMENTO'));
  });

  it('desabilita o seletor do painel enquanto a movimentacao esta em voo', async () => {
    const user = userEvent.setup();
    mocks.kanbanApi.moveTask.mockReturnValue(new Promise(() => {}));
    renderPage();
    await screen.findByText('Da sprint');

    await user.click(screen.getByRole('button', { name: /Da sprint/ }));
    const dialogo = screen.getByRole('dialog', { name: 'Da sprint' });
    const seletor = within(dialogo).getByRole('combobox', { name: 'Mover a tarefa Da sprint' });
    await user.selectOptions(seletor, 'EM_ANDAMENTO');

    await waitFor(() => expect(seletor).toBeDisabled());
  });

  // Sprint encerrada e registro (ADR-010 D04): o cartao nao arrasta e o seletor
  // do painel desabilita, para a regra nao aparecer como um 409 generico.
  it('bloqueia a tarefa de sprint congelada no cartao e no painel', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Congelada');

    expect(screen.getByText('Sprint congelada')).toBeInTheDocument();
    const cartao = screen.getByRole('button', { name: /Congelada/ });
    expect(cartao).toHaveAttribute('draggable', 'false');

    await user.click(cartao);
    const dialogo = screen.getByRole('dialog', { name: 'Congelada' });
    const seletor = within(dialogo).getByRole('combobox', { name: 'Mover a tarefa Congelada' });
    expect(seletor).toBeDisabled();
    expect(seletor).toHaveAttribute('title');
  });

  it('nomeia a sprint de cada cartao, e o backlog quando nao ha', async () => {
    renderPage();
    await screen.findByText('Da sprint');
    expect(screen.getAllByText('Sprint 4').length).toBeGreaterThan(0);
    expect(screen.getByText('Backlog')).toBeInTheDocument();
  });

  // O historico continua no Kanban (RF38): mover a troca de status para o
  // painel de detalhes nao tira a auditoria do quadro.
  it('mantem o historico de tarefas com o indicador de movimentacoes', async () => {
    renderPage();
    await screen.findByText('Da sprint');
    expect(screen.getByRole('heading', { name: 'Histórico de tarefas' })).toBeInTheDocument();
    expect(screen.getByText('Movimentações: 4')).toBeInTheDocument();
  });
});
