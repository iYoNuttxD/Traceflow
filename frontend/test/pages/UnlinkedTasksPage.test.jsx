import { MemoryRouter, Route, Routes } from 'react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getTasksWithoutTechnicalLinks: vi.fn(),
  getTraceabilityAlertSummary: vi.fn()
}));
vi.mock('../../src/features/traceability/api/traceability.api.js', () => api);
vi.mock('../../src/features/projects/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  ProjectSectionNav: ({ activeSection }) => (
    <nav aria-label="Navegação do projeto" data-active={activeSection} />
  )
}));

import { UnlinkedTasksPage } from '../../src/pages/UnlinkedTasksPage.jsx';

const task = (id, overrides = {}) => ({
  id,
  code: `TASK-${id}`,
  title: `Tarefa ${id}`,
  status: 'CONCLUIDO',
  responsible: { id: 2, name: 'Ana' },
  requirement: { id: 3, code: 'REQ-3' },
  updatedAt: '2026-10-05T17:32:00.000Z',
  ...overrides
});

const page = (tasks, { pageNumber = 1, total = tasks.length, totalPages = 1 } = {}) => ({
  projectId: 9,
  status: null,
  tasks,
  pagination: { page: pageNumber, limit: 20, total, totalPages }
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/projects/9/traceability/unlinked-tasks']}>
      <Routes>
        <Route
          path="/projects/:projectId/traceability/unlinked-tasks"
          element={<UnlinkedTasksPage />}
        />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getTraceabilityAlertSummary.mockResolvedValue({
    projectId: 9,
    open: { total: 2, byType: {} },
    dismissed: { total: 0 },
    rules: { taskWithoutCommitActive: true },
    permissions: { canLink: false, canManage: false }
  });
});

describe('S2-01 tela de tarefas sem vínculo técnico (RF58)', () => {
  it('sem tarefas mostra o estado vazio e a sub-navegação marcada', async () => {
    api.getTasksWithoutTechnicalLinks.mockResolvedValue(page([]));
    renderPage();

    expect(
      await screen.findByText('Todas as tarefas têm ao menos um vínculo técnico.')
    ).toBeInTheDocument();
    expect(screen.getByText('0 tarefas sem vínculo técnico')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Seções da rastreabilidade' });
    expect(within(nav).getByRole('link', { name: 'Tarefas sem vínculo técnico' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(await within(nav).findByRole('link', { name: 'Alertas (2)' })).toBeInTheDocument();
  });

  it('uma tarefa mostra status, responsável, requisito e o atalho para o Kanban', async () => {
    api.getTasksWithoutTechnicalLinks.mockResolvedValue(page([task(5)]));
    renderPage();

    expect(await screen.findByText('1 tarefa sem vínculo técnico')).toBeInTheDocument();
    const item = screen.getByRole('listitem');
    expect(within(item).getByText('Tarefa 5')).toBeInTheDocument();
    expect(within(item).getByText(/Concluído · Ana · REQ-3/)).toBeInTheDocument();
    expect(within(item).getByRole('link', { name: 'Abrir TASK-5 no Kanban' })).toHaveAttribute(
      'href',
      '/projects/9/kanban?task=5'
    );
  });

  it('25 tarefas carregam em duas páginas e o filtro de status refaz a consulta', async () => {
    api.getTasksWithoutTechnicalLinks
      .mockResolvedValueOnce(
        page(
          Array.from({ length: 20 }, (_, index) => task(index + 1)),
          { total: 25, totalPages: 2 }
        )
      )
      .mockResolvedValueOnce(
        page(
          Array.from({ length: 5 }, (_, index) => task(index + 21)),
          { pageNumber: 2, total: 25, totalPages: 2 }
        )
      )
      .mockResolvedValueOnce(page([task(9, { status: 'A_FAZER', responsible: null })]));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Carregar mais tarefas' }));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(25));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'A_FAZER');

    expect(await screen.findByText(/A fazer · Sem responsável · REQ-3/)).toBeInTheDocument();
    expect(api.getTasksWithoutTechnicalLinks).toHaveBeenLastCalledWith(
      '9',
      { status: 'A_FAZER', page: 1, limit: 20 },
      expect.objectContaining({ fresh: true })
    );
  });

  it('erro de carga oferece tentar novamente', async () => {
    api.getTasksWithoutTechnicalLinks
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce(page([task(1)]));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Tentar novamente/ }));

    expect(await screen.findByText('Tarefa 1')).toBeInTheDocument();
  });
});
