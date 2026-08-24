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
  scheduleApi: {
    listSprints: vi.fn(),
    listMilestones: vi.fn(),
    getSchedule: vi.fn(),
    getSprintProgress: vi.fn(),
    updateSprintStatus: vi.fn()
  }
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
// Mock no modulo de API, e nao no `index.js` da feature: assim o painel de
// andamento e os helpers de status continuam sendo os de verdade.
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
    mocks.scheduleApi.listMilestones.mockResolvedValue({ data: { total: 0, milestones: [] } });
    mocks.scheduleApi.getSchedule.mockResolvedValue({
      data: { projectId: 1, sprints: [], milestones: [], unassignedTasks: [] }
    });
    mocks.scheduleApi.getSprintProgress.mockResolvedValue({
      data: { burndown: { hasData: false, totalPoints: 0, days: [] } }
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

// ADR-011: o quadro passou a ser filtravel por sprint, a mover por <select> e a
// exibir o andamento da sprint logo abaixo das colunas.
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
    mocks.scheduleApi.listMilestones.mockResolvedValue({
      data: { total: 1, milestones: [{ id: 2, title: 'Gestão de sprints' }] }
    });
    mocks.scheduleApi.getSchedule.mockResolvedValue({
      data: {
        projectId: 1,
        sprints: [
          {
            id: 4,
            name: 'Sprint 4',
            tasks: [
              { id: 8, status: 'A_FAZER', estimatedEffort: 5 },
              { id: 11, status: 'CONCLUIDO', estimatedEffort: 3 }
            ]
          }
        ],
        milestones: [],
        unassignedTasks: []
      }
    });
    mocks.scheduleApi.getSprintProgress.mockResolvedValue({
      data: { burndown: { hasData: false, totalPoints: 0, days: [] } }
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

  // O <select> e alternativa ao arrasto, nao substituto: arrastar nao existe
  // para quem usa teclado ou toque.
  it('move a tarefa pelo seletor do cartao', async () => {
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

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Mover a tarefa Da sprint' }),
      'EM_ANDAMENTO'
    );

    await waitFor(() =>
      expect(mocks.kanbanApi.moveTask).toHaveBeenCalledWith(8, { toStatus: 'EM_ANDAMENTO' })
    );
  });

  // Sprint encerrada e registro (ADR-010 D04): o cartao vira somente leitura, e
  // dizer isso evita que a regra apareca como um 409 generico.
  it('bloqueia o cartao de sprint congelada', async () => {
    renderPage();
    await screen.findByText('Congelada');

    const seletor = screen.getByRole('combobox', { name: 'Mover a tarefa Congelada' });
    expect(seletor).toBeDisabled();
    expect(screen.getByText('Sprint congelada')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Congelada/ })).toHaveAttribute('draggable', 'false');
  });

  it('nomeia a sprint de cada cartao, e o backlog quando nao ha', async () => {
    renderPage();
    await screen.findByText('Da sprint');
    expect(screen.getAllByText('Sprint 4').length).toBeGreaterThan(0);
    expect(screen.getByText('Backlog')).toBeInTheDocument();
  });

  describe('andamento da sprint', () => {
    it('abre na sprint em andamento e descreve a evolucao', async () => {
      renderPage();
      await screen.findByText('Da sprint');

      const painel = await screen.findByRole('region', { name: 'Andamento das sprints' });
      expect(within(painel).getByRole('combobox', { name: 'Sprint' })).toHaveValue('4');
      expect(within(painel).getByText('Marco: Gestão de sprints')).toBeInTheDocument();
      expect(within(painel).getByText('1 de 2')).toBeInTheDocument();
      expect(within(painel).getByText('3 de 8')).toBeInTheDocument();
      expect(within(painel).getByText('38%')).toBeInTheDocument();
    });

    it('sem tarefas pontuadas explica a ausencia do burndown', async () => {
      renderPage();
      const painel = await screen.findByRole('region', { name: 'Andamento das sprints' });
      expect(
        await within(painel).findByText(/o burndown aparece quando houver tarefas/)
      ).toBeInTheDocument();
    });

    it('desenha o burndown quando ha pontos', async () => {
      mocks.scheduleApi.getSprintProgress.mockResolvedValue({
        data: {
          burndown: {
            hasData: true,
            totalPoints: 8,
            frozen: false,
            cutoffDate: '2026-08-12',
            days: [
              { date: '2026-08-10', ideal: 8, remaining: 8 },
              { date: '2026-08-11', ideal: 4, remaining: 5 },
              { date: '2026-08-12', ideal: 0, remaining: 5 }
            ]
          }
        }
      });
      renderPage();
      const painel = await screen.findByRole('region', { name: 'Andamento das sprints' });
      // `find`, e nao `get`: o painel monta antes de a evolucao chegar, e ate la
      // ele mostra o estado de carga.
      expect(
        await within(painel).findByRole('img', { name: /Restam 5 de 8 pontos/ })
      ).toBeInTheDocument();
      // A leitura nao pode depender do desenho: o mesmo numero aparece em texto.
      expect(within(painel).getAllByText(/Restam 5 de 8 pontos/).length).toBeGreaterThan(0);
    });

    it('concluir pede confirmacao e informa o efeito no backlog', async () => {
      const user = userEvent.setup();
      mocks.scheduleApi.updateSprintStatus.mockResolvedValue({
        data: {
          sprint: { ...sprintAtiva, status: 'CONCLUIDA' },
          message:
            'Status da sprint atualizado com sucesso. 1 tarefa não concluída voltou ao backlog.',
          returnedToBacklog: 1,
          milestoneCompleted: null
        }
      });
      renderPage();
      const painel = await screen.findByRole('region', { name: 'Andamento das sprints' });

      await user.click(within(painel).getByRole('button', { name: 'Concluir sprint' }));
      const dialog = await screen.findByRole('dialog');
      expect(
        within(dialog).getByText(/1 tarefa\(s\) não concluída\(s\) voltarão ao backlog/)
      ).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Concluir e congelar' }));

      await waitFor(() =>
        expect(mocks.scheduleApi.updateSprintStatus).toHaveBeenCalledWith(4, 'CONCLUIDA')
      );
      expect(await screen.findByText(/voltou ao backlog/)).toBeInTheDocument();
    });

    // Uma sprint em andamento por projeto (ADR-011 D06): oferecer o botao para o
    // backend recusar com 409 transformaria a regra numa descoberta pelo erro.
    it('desabilita iniciar enquanto outra sprint esta aberta', async () => {
      const user = userEvent.setup();
      mocks.scheduleApi.listSprints.mockResolvedValue({
        data: {
          total: 2,
          sprints: [
            sprintAtiva,
            {
              id: 5,
              name: 'Sprint 5',
              objective: null,
              startDate: '2026-08-24T00:00:00',
              endDate: '2026-09-04T00:00:00',
              status: 'PLANEJADA',
              milestoneId: 2
            }
          ]
        }
      });
      renderPage();
      const painel = await screen.findByRole('region', { name: 'Andamento das sprints' });

      await user.selectOptions(within(painel).getByRole('combobox', { name: 'Sprint' }), '5');
      const iniciar = await within(painel).findByRole('button', { name: 'Iniciar sprint' });
      expect(iniciar).toBeDisabled();
      expect(
        within(painel).getByText(/Conclua a sprint “Sprint 4” para iniciar outra/)
      ).toBeInTheDocument();
    });
  });

  // O historico continua no Kanban (RF38): o seletor do cartao substituiu o
  // painel de metrica da barra, nao a auditoria.
  it('mantem o historico de tarefas com o indicador de movimentacoes', async () => {
    renderPage();
    await screen.findByText('Da sprint');
    expect(screen.getByRole('heading', { name: 'Histórico de tarefas' })).toBeInTheDocument();
    expect(screen.getByText('Movimentações: 4')).toBeInTheDocument();
  });
});
