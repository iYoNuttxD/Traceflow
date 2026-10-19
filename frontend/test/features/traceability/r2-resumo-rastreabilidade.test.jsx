import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getRequirementsTraceability: vi.fn(),
  getRequirementTraceability: vi.fn(),
  getRequirementSituationHistory: vi.fn(),
  getTraceabilityAlertSummary: vi.fn()
}));
vi.mock('../../../src/features/traceability/api/traceability.api.js', () => api);
vi.mock('../../../src/features/traceability/components/TraceabilityFlow.jsx', () => ({
  TraceabilityFlow: () => <div />
}));

const { TraceabilityPage } = await import('../../../src/pages/TraceabilityPage.jsx');

const catalog = {
  items: [],
  summary: {
    total: 40,
    bySituation: {
      PLANEJADO: 5,
      EM_DESENVOLVIMENTO: 6,
      IMPLEMENTADO: 7,
      AGUARDANDO_VALIDACAO: 2,
      EM_VALIDACAO: 3,
      VALIDADO: 4,
      CONCLUIDO: 1
    },
    withDefect: 9
  },
  pagination: { page: 1, totalPages: 1, total: 40 }
};

function summary({ byType = {} } = {}) {
  return {
    projectId: 9,
    open: { total: Object.values(byType).reduce((total, count) => total + count, 0), byType },
    dismissed: { total: 0 },
    rules: { taskWithoutCommitActive: true, integrationConnected: true },
    reconciliation: {
      state: 'CURRENT',
      lastAttemptAt: '2026-10-16T09:00:00.000Z',
      lastSucceededAt: '2026-10-16T09:00:00.000Z',
      lastFailedAt: null,
      lastTrigger: 'GITHUB_SYNC'
    },
    permissions: { canLink: true, canManage: false }
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/projects/9/traceability']}>
      <Routes>
        <Route path="/projects/:projectId/traceability" element={<TraceabilityPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getRequirementsTraceability.mockResolvedValue(catalog);
  api.getRequirementSituationHistory.mockResolvedValue({ items: [], nextCursor: null });
  api.getTraceabilityAlertSummary.mockResolvedValue(summary());
});

describe('UX-R2-02 — inconsistências abertas no resumo da Rastreabilidade', () => {
  it('R-01 as inconsistências ficam dentro do bloco Resumo, sem faixa separada', async () => {
    renderPage();

    const overview = await screen.findByRole('region', { name: 'Resumo da rastreabilidade' });

    expect(
      await within(overview).findByRole('group', { name: 'Inconsistências abertas' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('group', { name: 'Inconsistências abertas' })).toHaveLength(1);
    expect(screen.queryByRole('region', { name: 'Inconsistências abertas' })).toBeNull();
  });

  it('R-02 as três contagens aparecem por tipo, com link para o contexto quando há inconsistência', async () => {
    api.getTraceabilityAlertSummary.mockResolvedValue(
      summary({ byType: { TASK_CONCLUDED_WITHOUT_COMMIT: 2, ISSUE_CLOSED_WITHOUT_TASK: 1 } })
    );
    renderPage();

    const group = await screen.findByRole('group', { name: 'Inconsistências abertas' });

    expect(
      await within(group).findByRole('link', { name: '2 tarefas concluídas sem commit' })
    ).toHaveAttribute('href', '/projects/9/tasks?rastreabilidade=SEM_COMMIT');
    expect(within(group).getByRole('link', { name: '1 issue fechada sem tarefa' })).toHaveAttribute(
      'href',
      '/projects/9/repository?inconsistencia=OPEN&tipo=issue'
    );
    const pullRequests = within(group).getByText('PRs mescladas sem tarefa').closest('div');
    expect(within(pullRequests).getByText('0')).toBeInTheDocument();
    expect(within(pullRequests).queryByRole('link')).toBeNull();
  });

  it('R-03 o grupo de inconsistências fica separado dos indicadores de requisito', async () => {
    renderPage();

    const group = await screen.findByRole('group', { name: 'Inconsistências abertas' });
    const overview = screen.getByRole('region', { name: 'Resumo da rastreabilidade' });
    const requirementMetrics = overview.querySelector('.requirement-metrics');

    expect(requirementMetrics.contains(group)).toBe(false);
    expect(within(requirementMetrics).queryByText(/sem tarefa|sem commit/)).toBeNull();
    expect(
      within(group).getByRole('heading', { name: 'Inconsistências abertas' })
    ).toBeInTheDocument();
  });
});
