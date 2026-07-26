import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../../src/shared/index.js';

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn() },
  confirmRequirementCompletion: vi.fn(),
  deleteRequirement: vi.fn(),
  getRequirementTaskCoverage: vi.fn(),
  replaceRequirementTasks: vi.fn(),
  requirementsApi: { create: vi.fn(), listByProject: vi.fn(), update: vi.fn() }
}));

vi.mock('../../src/features/requirements/api/requirements.api.js', () => ({
  confirmRequirementCompletion: mocks.confirmRequirementCompletion,
  deleteRequirement: mocks.deleteRequirement,
  replaceRequirementTasks: mocks.replaceRequirementTasks,
  requirementsApi: mocks.requirementsApi
}));
vi.mock('../../src/features/traceability/api/traceability.api.js', () => ({
  getRequirementTaskCoverage: mocks.getRequirementTaskCoverage
}));
vi.mock('../../src/features/projects/api/projects.api.js', () => ({
  projectsApi: { get: (id) => mocks.api.get(`/projects/${id}`) }
}));
vi.mock('../../src/features/tasks/api/tasks.api.js', () => ({
  tasksApi: { list: (id, params) => mocks.api.get(`/projects/${id}/tasks`, { params }) }
}));

import { RequirementsPage } from '../../src/pages/RequirementsPage.jsx';

const task = { id: 20, title: 'Tarefa artificial', status: 'A_FAZER', requirementId: 10 };
const requirement = {
  id: 10,
  projectId: 9,
  title: 'Requisito artificial',
  description: 'Descrição artificial',
  type: 'FUNCIONAL',
  status: 'CADASTRADO',
  tasks: [task]
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/projects/9/requirements']}>
      <Routes>
        <Route
          path="/projects/:projectId/requirements"
          element={
            <ConfirmProvider>
              <RequirementsPage />
            </ConfirmProvider>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('RequirementsPage E10', () => {
  beforeEach(() => {
    mocks.api.get.mockResolvedValue({ data: { project: { id: 9, name: 'Projeto artificial' } } });
    mocks.requirementsApi.listByProject.mockResolvedValue({
      data: { requirements: [requirement] }
    });
    mocks.getRequirementTaskCoverage.mockResolvedValue({
      totalRequirements: 1,
      linkedRequirements: 1,
      coveragePercentage: 100
    });
    mocks.requirementsApi.update.mockResolvedValue({
      data: { message: 'Requisito atualizado com sucesso.', requirement }
    });
    mocks.replaceRequirementTasks.mockResolvedValue({
      requirement,
      reassignedTasks: [],
      changes: { linked: 0, unlinked: 0 }
    });
  });

  it('substitui os loops de vínculo por uma única atualização atômica', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    await user.clear(screen.getByLabelText('Título do requisito'));
    await user.type(screen.getByLabelText('Título do requisito'), 'Requisito editado');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => {
      expect(mocks.replaceRequirementTasks).toHaveBeenCalledTimes(1);
      expect(mocks.replaceRequirementTasks).toHaveBeenCalledWith(10, [20]);
    });
    expect(mocks.requirementsApi.update).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ title: 'Requisito editado' })
    );
  });
});
