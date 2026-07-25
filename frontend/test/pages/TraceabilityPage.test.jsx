import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  getRequirementsTraceabilityMatrix: vi.fn(),
  getRequirementTraceability: vi.fn()
}));

vi.mock('../../src/api/api.js', () => apiMocks);
vi.mock('../../src/components/TraceabilityFlow.jsx', () => ({
  TraceabilityFlow({ traceability }) {
    const requirement = traceability.nodes.find((node) => node.type === 'REQUIREMENT');
    const task = traceability.nodes.find((node) => node.type === 'TASK');
    const commit = traceability.nodes.find((node) => node.type === 'COMMIT');

    return (
      <div data-testid="traceability-flow-contract">
        {requirement?.data.title} | {task?.data.title || 'sem tarefa'} |{' '}
        {commit?.data.shortHash || 'sem artefato'}
      </div>
    );
  }
}));

import { TraceabilityPage } from '../../src/pages/TraceabilityPage.jsx';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/projects/9/traceability']}>
      <Routes>
        <Route path="/projects/:projectId/traceability" element={<TraceabilityPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('TraceabilityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza o estado vazio devolvido pelo backend', async () => {
    apiMocks.getRequirementsTraceabilityMatrix.mockResolvedValue({
      projectId: 9,
      summary: {
        totalRequirements: 0,
        requirementsWithTasks: 0,
        requirementsWithTechnicalEvidence: 0,
        implementedRequirements: 0,
        averageProgressPercentage: 0
      },
      requirements: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
    });
    renderPage();

    expect(
      await screen.findByText('Nenhum requisito cadastrado para este projeto.')
    ).toBeInTheDocument();
  });

  it('consome a matriz e o detalhe atual com tarefa e artefato', async () => {
    const user = userEvent.setup();
    apiMocks.getRequirementsTraceabilityMatrix.mockResolvedValue({
      projectId: 9,
      summary: {
        totalRequirements: 1,
        requirementsWithTasks: 1,
        requirementsWithTechnicalEvidence: 1,
        implementedRequirements: 0,
        averageProgressPercentage: 0,
        averageProgress: { numerator: 0, denominator: 1, percentage: 0, hasData: true }
      },
      requirements: [
        {
          id: 10,
          title: 'Requisito artificial',
          description: 'Descrição artificial',
          status: 'CADASTRADO',
          progressPercentage: 0,
          completedTasksCount: 0,
          tasksCount: 1,
          issuesCount: 0,
          pullRequestsCount: 0,
          commitsCount: 1,
          hasTechnicalEvidence: true,
          implementationStatus: 'EM_DESENVOLVIMENTO'
        }
      ],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
    });
    apiMocks.getRequirementTraceability.mockResolvedValue({
      projectId: 9,
      perspective: { type: 'REQUIREMENT', id: 10 },
      summary: { hasTechnicalEvidence: true },
      nodes: [
        { id: 'requirement:10', type: 'REQUIREMENT', data: { id: 10, title: 'Requisito artificial' } },
        { id: 'task:20', type: 'TASK', data: { id: 20, title: 'Tarefa artificial' } },
        { id: 'commit:30', type: 'COMMIT', data: { id: 30, shortHash: 'abcdef1' } }
      ],
      edges: [
        { id: 'rt', type: 'REQUIREMENT_TASK', source: 'requirement:10', target: 'task:20' },
        { id: 'tc', type: 'TASK_COMMIT', source: 'task:20', target: 'commit:30' }
      ],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Requisito artificial/ }));

    expect(await screen.findByTestId('traceability-flow-contract')).toHaveTextContent(
      'Requisito artificial | Tarefa artificial | abcdef1'
    );
    expect(apiMocks.getRequirementTraceability).toHaveBeenCalledWith('9', 10);
    expect(apiMocks.getRequirementsTraceabilityMatrix).toHaveBeenCalledWith('9', { page: 1, limit: 20 });
  });
});
