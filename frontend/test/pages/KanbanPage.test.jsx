import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  membersApi: { list: vi.fn() }
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
  membersApi: mocks.membersApi
}));
vi.mock('../../src/features/projects/api/projects.api.js', () => ({
  projectsApi: { get: (id) => mocks.api.get(`/projects/${id}`) }
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
  fireEvent.dragStart(screen.getByRole('button', { name: /Tarefa E11/ }), { dataTransfer });
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
      expect(mocks.kanbanApi.listTaskHistory).toHaveBeenLastCalledWith(
        '1',
        {
          page: 2,
          limit: 10
        },
        { signal: expect.any(AbortSignal) }
      )
    );
    expect(await screen.findByText(/Prioridade: Média para Alta/)).toBeInTheDocument();
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
