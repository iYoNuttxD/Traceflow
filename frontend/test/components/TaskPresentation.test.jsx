import { render, screen, within } from '@testing-library/react';
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

  it('preserva seleção por teclado e colunas oficiais no board', async () => {
    const user = userEvent.setup();
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

    const card = screen.getByRole('button', { name: 'Abrir detalhes de Consolidar frontend' });
    card.focus();
    await user.keyboard('{Enter}');
    expect(onSelectTask).toHaveBeenCalledWith(task, card);
    expect(screen.getByRole('heading', { name: 'Em Andamento' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Concluído' })).toBeInTheDocument();
    expect(screen.getByText('#7')).toBeInTheDocument();
    expect(screen.getByText('1 req · 1 PR · 1 commit · 1 issue')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ver histórico da tarefa/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mais ações/ })).toBeNull();
  });

  it('mantém o painel de detalhes como consulta C2 com rastreabilidade e comentários', async () => {
    const user = userEvent.setup();
    const handlers = {
      onClose: vi.fn(),
      onDelete: vi.fn()
    };
    render(
      <ConfirmProvider>
        <TaskDetailsPanel task={task} deleting={false} canDelete {...handlers} />
      </ConfirmProvider>
    );

    const dialog = screen.getByRole('dialog', { name: /#7 Consolidar frontend/ });
    expect(within(dialog).queryByRole('combobox')).toBeNull();
    expect(within(dialog).getByText('A Fazer')).toBeInTheDocument();
    expect(within(dialog).getByText('Comentários')).toBeInTheDocument();
    const githubLinks = screen.getAllByRole('link', { name: 'Abrir no GitHub' });
    expect(githubLinks.map((link) => link.getAttribute('href'))).toEqual([
      'https://github.com/example/pull/15',
      'https://github.com/example/commit/abcdef123',
      'https://github.com/example/issues/9'
    ]);
    for (const link of githubLinks) {
      expect(link.tagName).toBe('A');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(link).toHaveClass('task-detail-external-link');
      expect(link.querySelector('[data-icon="externalLink"]')).toHaveAttribute(
        'aria-hidden',
        'true'
      );
    }
    expect(screen.queryByRole('button', { name: /Remover .* vinculado/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Excluir tarefa' }));
    expect(handlers.onDelete).toHaveBeenCalledWith(task);
  });

  it('mantém todos os artefatos acessíveis dentro de corpos roláveis por categoria', () => {
    const commits = Array.from({ length: 14 }, (_, index) => ({
      id: 100 + index,
      hash: `abcdef${index}`,
      shortHash: `cmt${String(index + 1).padStart(4, '0')}`,
      message: `Commit rastreável ${index + 1}`
    }));
    const issues = Array.from({ length: 12 }, (_, index) => ({
      id: 200 + index,
      number: 300 + index,
      title: `Issue rastreável ${index + 1}`
    }));
    const { container } = render(
      <ConfirmProvider>
        <TaskDetailsPanel
          task={{ ...task, commits, issues }}
          deleting={false}
          onClose={vi.fn()}
          onDelete={vi.fn()}
        />
      </ConfirmProvider>
    );

    expect(screen.getByLabelText('14 commits')).toBeInTheDocument();
    expect(screen.getByLabelText('12 issues')).toBeInTheDocument();
    expect(screen.getByText('cmt0014 — Commit rastreável 14')).toBeInTheDocument();
    expect(screen.getByText('#311 — Issue rastreável 12')).toBeInTheDocument();
    expect(container.querySelectorAll('.task-detail-artifact-body')).toHaveLength(4);
  });
});
