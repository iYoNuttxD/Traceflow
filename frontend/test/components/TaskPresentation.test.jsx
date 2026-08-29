import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/features/tasks/api/tasks.api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getTaskComments: vi.fn().mockResolvedValue({
    taskId: 7,
    total: 0,
    comments: [],
    permissions: { canComment: false, canModerate: false },
    pagination: { page: 1, limit: 5, total: 0, totalPages: 0 }
  })
}));

import { KanbanBoard } from '../../src/features/tasks/components/KanbanBoard.jsx';
import { MovementHistory } from '../../src/features/tasks/components/MovementHistory.jsx';
import { TaskDetailsPanel } from '../../src/features/tasks/components/TaskDetailsPanel.jsx';
import { TaskList } from '../../src/features/tasks/components/TaskList.jsx';
import { TaskMetrics } from '../../src/features/tasks/components/TaskMetrics.jsx';
import { ConfirmProvider } from '../../src/shared/index.js';

const task = {
  id: 7,
  title: 'Consolidar frontend',
  description: 'Separar apresentação e coordenação.',
  priority: 'ALTA',
  status: 'A_FAZER',
  responsibleUser: { id: 2, name: 'Pessoa responsável' },
  deadline: '2026-07-30',
  estimatedEffort: 8,
  actualEffort: 3,
  createdAt: '2026-07-26T12:00:00.000Z',
  requirement: { id: 10, title: 'RF frontend' },
  pullRequest: {
    id: 20,
    number: 15,
    title: 'Route splitting',
    githubUrl: 'https://github.com/example/pull/15'
  },
  commits: [
    {
      id: 30,
      hash: 'abcdef123',
      message: 'lazy routes',
      githubUrl: 'https://github.com/example/commit/abcdef123'
    }
  ],
  issues: [
    { id: 40, number: 9, title: 'Bundle grande', githubUrl: 'https://github.com/example/issues/9' }
  ]
};

describe('apresentação de Tasks e Kanban', () => {
  it('renderiza métricas e ações de rastreabilidade sem duplicar regras na screen', async () => {
    const user = userEvent.setup();
    const handlers = {
      onEdit: vi.fn(),
      onDelete: vi.fn(),
      onUnlinkRequirement: vi.fn(),
      onUnlinkPullRequest: vi.fn(),
      onUnlinkCommit: vi.fn(),
      onUnlinkIssue: vi.fn()
    };
    render(
      <>
        <TaskMetrics
          total={1}
          pullRequestCoverage={{ coveragePercentage: 100, linkedTasks: 1, totalTasks: 1 }}
          commitCoverage={{ coveragePercentage: 100, linkedTasks: 1, totalTasks: 1 }}
          issueCoverage={{ coveragePercentage: 100, linkedTasks: 1, totalTasks: 1 }}
        />
        <TaskList tasks={[task]} deletingTaskId={null} {...handlers} />
      </>
    );

    expect(screen.getByText('Consolidar frontend')).toBeInTheDocument();
    expect(screen.getAllByText('100%')).toHaveLength(3);
    expect(screen.getByRole('link', { name: /#15/ })).toHaveAttribute('rel', 'noopener noreferrer');
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.click(screen.getByRole('button', { name: 'Remover commit vinculado' }));
    expect(handlers.onEdit).toHaveBeenCalledWith(task);
    expect(handlers.onUnlinkCommit).toHaveBeenCalledWith(7, 30);
  });

  it('preserva seleção por teclado e colunas oficiais no board', () => {
    const onSelectTask = vi.fn();
    render(
      <KanbanBoard
        board={{
          columns: { A_FAZER: [task], EM_ANDAMENTO: [], CONCLUIDO: [] },
          totals: { A_FAZER: 1, EM_ANDAMENTO: 0, CONCLUIDO: 0 }
        }}
        movingTaskId={null}
        draggingTaskId={null}
        dragOverStatus=""
        onSelectTask={onSelectTask}
        onTaskDragStart={vi.fn()}
        onTaskDragEnd={vi.fn()}
        onColumnDragOver={vi.fn()}
        onColumnDragLeave={vi.fn()}
        onColumnDrop={vi.fn()}
      />
    );

    const card = screen.getByRole('button', { name: /Consolidar frontend/ });
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(onSelectTask).toHaveBeenCalledWith(task);
    expect(screen.getByRole('heading', { name: 'Em Andamento (0)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Concluído (0)' })).toBeInTheDocument();
  });

  it('mantém filtros e paginação do histórico como callbacks de fluxo', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    const onFieldFilterChange = vi.fn();
    render(
      <MovementHistory
        movements={[
          {
            id: 1,
            taskId: 7,
            taskTitle: 'Consolidar frontend',
            actorUserId: 2,
            actor: { name: 'Pessoa responsável' },
            field: 'STATUS',
            fromValue: 'A_FAZER',
            toValue: 'EM_ANDAMENTO',
            occurredAt: '2026-07-26T12:00:00.000Z'
          }
        ]}
        pagination={{ total: 11 }}
        rangeStart={1}
        rangeEnd={10}
        currentPage={1}
        totalPages={2}
        pageSize={10}
        period={{ startDate: '', endDate: '' }}
        memberFilter=""
        fieldFilter=""
        members={[]}
        metrics={{}}
        onPeriodChange={vi.fn()}
        onMemberFilterChange={vi.fn()}
        onFieldFilterChange={onFieldFilterChange}
        onSubmit={vi.fn((event) => event.preventDefault())}
        onClear={vi.fn()}
        onPageChange={onPageChange}
      />
    );

    await user.selectOptions(screen.getByLabelText('Campo'), 'STATUS');
    await user.click(screen.getByRole('button', { name: 'Próxima' }));
    expect(onFieldFilterChange).toHaveBeenCalledWith('STATUS');
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('mantém o painel de detalhes e seus vínculos técnicos acionáveis', async () => {
    const user = userEvent.setup();
    const handlers = {
      onClose: vi.fn(),
      onDelete: vi.fn(),
      onUnlinkRequirement: vi.fn(),
      onUnlinkPullRequest: vi.fn(),
      onUnlinkCommit: vi.fn(),
      onUnlinkIssue: vi.fn()
    };
    render(
      <ConfirmProvider>
        <TaskDetailsPanel task={task} deleting={false} {...handlers} />
      </ConfirmProvider>
    );

    expect(screen.getByRole('dialog', { name: 'Consolidar frontend' })).toBeInTheDocument();
    for (const link of screen.getAllByRole('link', { name: 'Abrir no GitHub' })) {
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    await user.click(screen.getByRole('button', { name: 'Remover requisito vinculado' }));
    await user.click(screen.getByRole('button', { name: 'Remover issue vinculada' }));
    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(handlers.onUnlinkRequirement).toHaveBeenCalledWith(7);
    expect(handlers.onUnlinkIssue).toHaveBeenCalledWith(7, 40);
    expect(handlers.onDelete).toHaveBeenCalledWith(task);
  });
});
