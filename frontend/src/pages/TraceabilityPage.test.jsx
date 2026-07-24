import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  getRequirementsTraceabilityMatrix: vi.fn(),
  getRequirementTraceability: vi.fn()
}));

vi.mock('../api/api.js', () => apiMocks);
vi.mock('../components/TraceabilityFlow.jsx', () => ({
  TraceabilityFlow({ traceability }) {
    const task = traceability.tasks[0];

    return (
      <div data-testid="traceability-flow-contract">
        {traceability.requirement.title} | {task?.title || 'sem tarefa'} |{' '}
        {task?.commits?.[0]?.shortHash || 'sem artefato'}
      </div>
    );
  }
}));

import { TraceabilityPage } from './TraceabilityPage.jsx';

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
      requirements: []
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
        averageProgressPercentage: 0
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
      ]
    });
    apiMocks.getRequirementTraceability.mockResolvedValue({
      projectId: 9,
      requirement: {
        id: 10,
        title: 'Requisito artificial',
        status: 'CADASTRADO',
        progressPercentage: 0,
        implementationStatus: 'EM_DESENVOLVIMENTO',
        hasTechnicalEvidence: true
      },
      tasks: [
        {
          id: 20,
          title: 'Tarefa artificial',
          status: 'A_FAZER',
          pullRequest: null,
          issues: [],
          commits: [{ id: 30, hash: 'abcdef123', shortHash: 'abcdef1' }]
        }
      ]
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Requisito artificial/ }));

    expect(await screen.findByTestId('traceability-flow-contract')).toHaveTextContent(
      'Requisito artificial | Tarefa artificial | abcdef1'
    );
    expect(apiMocks.getRequirementTraceability).toHaveBeenCalledWith('9', 10);
  });
});
