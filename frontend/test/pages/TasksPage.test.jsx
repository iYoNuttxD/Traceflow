import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  listTasks: vi.fn(),
  getTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  listRequirements: vi.fn(),
  listMembers: vi.fn(),
  listSprints: vi.fn(),
  listMilestones: vi.fn(),
  listPullRequests: vi.fn()
}));

vi.mock('../../src/features/tasks/api/tasks.api.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    tasksApi: {
      ...actual.tasksApi,
      list: mocks.listTasks,
      get: mocks.getTask,
      create: mocks.createTask,
      update: mocks.updateTask
    },
    deleteTask: mocks.deleteTask
  };
});

vi.mock('../../src/features/projects/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  projectsApi: { get: mocks.getProject }
}));

vi.mock('../../src/features/requirements/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requirementsApi: { listByProject: mocks.listRequirements }
}));

vi.mock('../../src/features/members/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  membersApi: { list: mocks.listMembers }
}));

vi.mock('../../src/features/schedule/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    scheduleApi: {
      ...actual.scheduleApi,
      listSprints: mocks.listSprints,
      listMilestones: mocks.listMilestones
    }
  };
});

vi.mock('../../src/features/github/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getProjectPullRequests: mocks.listPullRequests
}));

vi.mock('../../src/features/traceability/api/traceability.api.js', () => ({
  getCommitSuggestions: vi.fn().mockResolvedValue({
    suggestions: [],
    permissions: { canReview: true },
    pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
  }),
  confirmCommitSuggestion: vi.fn(),
  rejectCommitSuggestion: vi.fn(),
  scanCommitSuggestions: vi.fn()
}));

vi.mock('../../src/features/tasks/components/TaskDetailsPanel.jsx', () => ({
  TaskDetailsPanel: ({ task, canEdit, onClose }) => (
    <section role="dialog" aria-label={`Detalhes de TASK-${task.id}`} data-can-edit={canEdit}>
      <h2>{task.title}</h2>
      <button type="button" onClick={onClose}>
        Fechar detalhes
      </button>
    </section>
  )
}));

import { TasksScreen } from '../../src/features/tasks/pages/TasksScreen.jsx';
import { ConfirmProvider } from '../../src/shared/index.js';

const task = {
  id: 21,
  projectId: 9,
  title: 'Preparar roteiro da demonstração',
  description: 'Organizar o caminho principal da banca e revisar os dados apresentados.',
  priority: 'ALTA',
  status: 'A_FAZER',
  responsibleUserId: 2,
  responsibleUser: { id: 2, name: 'Daniel Ganz Musse' },
  sprintId: 3,
  deadline: '2026-09-26',
  estimatedEffort: 3,
  actualEffort: 1.5,
  requirement: { id: 8, title: 'Demonstração' },
  commits: [],
  issues: []
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/projects/9/tasks']}>
      <ConfirmProvider>
        <Routes>
          <Route path="/projects/:projectId/tasks" element={<TasksScreen />} />
        </Routes>
      </ConfirmProvider>
    </MemoryRouter>
  );
}

describe('Tasks C2 facelift', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProject.mockResolvedValue({ data: { project: { id: 9, name: 'TraceFlow' } } });
    mocks.listTasks.mockResolvedValue({ data: { tasks: [task] } });
    mocks.getTask.mockResolvedValue({ data: { task } });
    mocks.listRequirements.mockResolvedValue({ data: { requirements: [task.requirement] } });
    mocks.listMembers.mockResolvedValue({
      currentMembership: { role: 'MEMBER' },
      members: [{ id: 12, isActive: true, userId: 2, user: task.responsibleUser }]
    });
    mocks.listSprints.mockResolvedValue({
      data: { sprints: [{ id: 3, name: 'Sprint 3', status: 'PLANEJADA' }] }
    });
    mocks.listMilestones.mockResolvedValue({ data: { milestones: [] } });
    mocks.listPullRequests.mockResolvedValue({ pullRequests: [] });
  });

  it('substitui o layout legado por resumo, filtros recolhidos e catálogo operacional', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Tarefas', level: 1 })).toBeInTheDocument();
    expect(screen.queryByText('← Voltar para o projeto')).toBeNull();
    expect(screen.getByText('Visão geral das tarefas')).toBeInTheDocument();
    expect(screen.getByText('Com responsável')).toBeInTheDocument();
    expect(screen.queryByText(/Cobertura com Pull Requests/i)).toBeNull();

    const filters = screen.getByRole('button', { name: /Buscar e filtrar/ });
    expect(filters).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Buscar tarefa')).toBeNull();
    expect(screen.getByRole('button', { name: 'Nova tarefa' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: /Abrir detalhes de TASK-21/ })).toBeInTheDocument();
    expect(screen.queryByText('Ver detalhes')).toBeNull();
    expect(screen.getByText('A Fazer')).toBeInTheDocument();
    expect(screen.getByText('Daniel Ganz Musse')).toBeInTheDocument();
    expect(screen.getByText('Sprint 3')).toBeInTheDocument();
    expect(mocks.listMilestones).not.toHaveBeenCalled();
    expect(screen.queryByText('Pull request')).toBeNull();
    expect(screen.queryByText('Commits')).toBeNull();
  });

  it('expande busca e filtros de Task e atualiza o resultado instantaneamente', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Preparar roteiro da demonstração');

    await user.click(screen.getByRole('button', { name: /Buscar e filtrar/ }));
    expect(screen.getByRole('button', { name: /Buscar e filtrar/ })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    expect(screen.getByLabelText('Prioridade')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Responsável/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Sprint')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Buscar tarefa'), 'TASK-999');
    expect(screen.getByText('Nenhuma tarefa corresponde aos filtros.')).toBeInTheDocument();
    expect(screen.getByText('0 de 1 tarefas')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(screen.getByText('Preparar roteiro da demonstração')).toBeInTheDocument();
  });

  it('abre criação e edição em dialog e o Details canônico pelo corpo do card', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Preparar roteiro da demonstração');

    await user.click(screen.getByRole('button', { name: 'Nova tarefa' }));
    let dialog = screen.getByRole('dialog', { name: 'Nova tarefa' });
    expect(within(dialog).getByText('Informações')).toBeInTheDocument();
    expect(within(dialog).getByText('Planejamento')).toBeInTheDocument();
    expect(within(dialog).getByText('Rastreabilidade')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Fechar nova tarefa' }));

    const menu = screen.getByRole('button', { name: 'Mais ações da tarefa TASK-21' });
    await user.click(menu);
    await user.click(screen.getByRole('menuitem', { name: 'Editar TASK-21' }));
    dialog = screen.getByRole('dialog', { name: 'Editar tarefa' });
    expect(within(dialog).getByLabelText('Título da tarefa')).toHaveValue(task.title);
    await user.click(within(dialog).getByRole('button', { name: 'Fechar editar tarefa' }));

    await user.click(screen.getByRole('article', { name: /Abrir detalhes de TASK-21/ }));
    expect(screen.getByRole('dialog', { name: 'Detalhes de TASK-21' })).toHaveAttribute(
      'data-can-edit',
      'true'
    );
    await waitFor(() => expect(mocks.getTask).toHaveBeenCalledWith(21, expect.any(Object)));
  });

  it('mantém VIEWER em consulta sem criação nem menu administrativo', async () => {
    mocks.listMembers.mockResolvedValue({
      currentMembership: { role: 'VIEWER' },
      members: [{ id: 12, isActive: true, userId: 2, user: task.responsibleUser }]
    });
    const user = userEvent.setup();
    const { container } = renderPage();
    await screen.findByText('Preparar roteiro da demonstração');

    expect(screen.queryByRole('button', { name: 'Nova tarefa' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mais ações da tarefa TASK-21' })).toBeNull();
    expect(container.querySelector('.task-catalog-card__footer')).toBeNull();
    await user.click(screen.getByRole('article', { name: /Abrir detalhes de TASK-21/ }));
    expect(screen.getByRole('dialog', { name: 'Detalhes de TASK-21' })).toHaveAttribute(
      'data-can-edit',
      'false'
    );
  });
});
