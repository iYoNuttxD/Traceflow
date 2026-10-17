import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { RequirementCard } from '../../src/features/traceability/components/RequirementCatalog.jsx';
import { TraceabilityInspector } from '../../src/features/traceability/components/TraceabilityInspector.jsx';
import { graphFields } from '../../src/features/traceability/components/GraphNode.jsx';
import { implementationEvidence } from '../../src/features/traceability/model/requirement-view.js';
import { describeHealthReason } from '../../src/features/indicators/health-display.js';

const projection = {
  requirement: {
    id: 1,
    displayId: 'REQ-1',
    title: 'Fluxo local',
    status: 'CONCLUIDO',
    lifecycleBasis: 'LOCAL'
  },
  situation: 'CONCLUIDO',
  progress: { percentage: 100, tasksTotal: 1, tasksDone: 1 },
  implementation: { basis: 'LOCAL', implemented: true, technicalImplemented: false },
  artifacts: { pullRequests: 0, commits: 0, issues: 0 },
  validation: { testCasesTotal: 1, pass: 1, fail: 0, blocked: 0, neverExecuted: 0 },
  defects: { total: 0, open: 0, inCorrection: 0, waitingRetest: 0, validated: 0 },
  evidence: {
    implementation: false,
    validation: true,
    correction: 'NOT_APPLICABLE',
    correctionBasis: 'LOCAL'
  }
};

describe('standalone lifecycle presentation', () => {
  it('shows completed local implementation without fabricating technical evidence', () => {
    render(<RequirementCard item={projection} onSelect={vi.fn()} onHistory={vi.fn()} />);
    expect(screen.getByLabelText('Implementação local: Presente')).toBeInTheDocument();
    expect(screen.getByLabelText('PRs: 0')).toBeInTheDocument();
    expect(screen.getByLabelText('Commits: 0')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ajuda: Evidências' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'A vinculação posterior ao GitHub preserva esta base'
    );
    expect(projection.evidence.implementation).toBe(false);
  });
  it('uses the persisted basis rather than deriving a lifecycle from artifact counts', () => {
    expect(
      implementationEvidence({
        ...projection,
        implementation: { basis: 'GITHUB', implemented: false }
      })
    ).toMatchObject({
      label: 'Implementação',
      present: false,
      local: false
    });
    expect(
      implementationEvidence({
        ...projection,
        implementation: { basis: 'LOCAL', implemented: false }
      })
    ).toMatchObject({
      label: 'Implementação local',
      present: false,
      local: true
    });
  });
  it('keeps the graph and Inspector explicit about local completion after GitHub is linked', () => {
    const node = {
      id: 'requirement:1',
      type: 'REQUIREMENT',
      entityId: 1,
      data: { ...projection.requirement, projection }
    };
    const fields = Object.fromEntries(graphFields(node.type, node.data));
    expect(fields.Evidências).toContain('Implementação local: presente');
    render(
      <MemoryRouter>
        <TraceabilityInspector
          node={node}
          contract={{ nodes: [node], edges: [], githubIntegration: { status: 'ACTIVE' } }}
        />
      </MemoryRouter>
    );
    expect(screen.getByText(/Ciclo local: conclusão por tarefas e validação/)).toBeInTheDocument();
    expect(screen.getByText(/0 PRs · 0 commits · 0 issues/)).toBeInTheDocument();
  });
  it('identifies the technical health cohort and does not call an absent cohort healthy', () => {
    expect(
      describeHealthReason(
        {
          reasonCode: 'STAGE_GAP',
          basis: {
            scope: 'GITHUB_REQUIREMENTS',
            denominator: 2,
            current: 50,
            expected: 100,
            gapPoints: 50
          }
        },
        'I62'
      )
    ).toBe(
      'Comparação restrita a 2 requisitos de ciclo GitHub. Cobertura observada de 50% frente a 100% no estágio anterior; lacuna de 50 pontos percentuais.'
    );
    expect(
      describeHealthReason({ reasonCode: 'GITHUB_LIFECYCLE_NOT_APPLICABLE' }, 'I62')
    ).toContain('Não há requisitos de ciclo GitHub');
  });
});
