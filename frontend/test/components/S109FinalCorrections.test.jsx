import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, it, expect, vi } from 'vitest';
import { ProjectSectionNav } from '../../src/features/projects/components/ProjectSectionNav.jsx';
import { TraceabilityInspector } from '../../src/features/traceability/components/TraceabilityInspector.jsx';
import {
  RequirementFilters,
  RequirementSummary
} from '../../src/features/traceability/components/RequirementCatalog.jsx';
import { emptyFilters } from '../../src/features/traceability/model/requirement-view.js';
import { DefectCard } from '../../src/features/defects/DefectsScreen.jsx';

const task = {
  id: 'task:1',
  entityId: 1,
  type: 'TASK',
  data: {
    id: 1,
    title: 'Correção',
    status: 'EM_ANDAMENTO',
    priority: 'ALTA',
    responsible: 'Daniel',
    estimatedEffort: 5,
    actualEffort: 7
  }
};
const show = (node) =>
  render(
    <TraceabilityInspector
      node={node}
      contract={{ nodes: [node], edges: [] }}
      onClose={() => {}}
      onSelect={() => {}}
      onDetails={() => {}}
    />
  );
describe('S1-09 final corrections', () => {
  it('orders project destinations without changing URLs or active semantics', () => {
    render(
      <MemoryRouter>
        <ProjectSectionNav projectId={2} activeSection="traceability" />
      </MemoryRouter>
    );
    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Visão geral',
      'Requisitos',
      'Sprints',
      'Marcos',
      'Cronograma',
      'Tarefas',
      'Kanban',
      'Casos de teste',
      'Defeitos',
      'Repositório',
      'Rastreabilidade'
    ]);
    expect(links.at(-1)).toHaveAttribute('href', '/projects/2/traceability');
    expect(links.at(-1)).toHaveAttribute('aria-current', 'page');
  });
  it('shows estimated and realized effort, including overrun, using Task semantics', () => {
    show(task);
    const effort = screen.getByRole('region', { name: 'Esforço' });
    expect(within(effort).getByText('5h')).toBeVisible();
    expect(within(effort).getByText('7h')).toBeVisible();
    expect(within(effort).getByText('140%')).toHaveClass('tc-badge--danger');
    expect(within(effort).getByText('Tempo estourado')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Informações' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Rastreabilidade' })).toBeVisible();
  });
  it('does not infer a percentage with no estimate and shows zero realized', () => {
    show({ ...task, data: { ...task.data, estimatedEffort: null, actualEffort: null } });
    expect(screen.getByText('Não informado')).toBeVisible();
    expect(screen.getByText('0h')).toBeVisible();
    expect(screen.queryByText('Progresso do esforço')).not.toBeInTheDocument();
  });
  it('uses the canonical external action for PR and keeps relations', () => {
    show({
      id: 'pull-request:8',
      entityId: 8,
      type: 'PULL_REQUEST',
      data: {
        id: 8,
        number: 8,
        title: 'Fix',
        state: 'closed',
        authorUsername: 'dev',
        sourceBranch: 'fix',
        targetBranch: 'main',
        githubUrl: 'https://github.com/example/repo/pull/8'
      }
    });
    expect(screen.getByRole('link', { name: 'Abrir no GitHub' })).toHaveClass(
      'task-detail-external-link'
    );
    expect(screen.getByText('fix → main')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Relações na cadeia' })).toBeVisible();
  });
  it('uses macro status as the first lifecycle filter, with detailed situations distinct', async () => {
    const changed = vi.fn();
    render(
      <RequirementFilters
        filters={emptyFilters}
        onChange={changed}
        onClear={() => {}}
        total={4}
        count={4}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /Buscar e filtrar/ }));
    const status = screen.getByLabelText('Status');
    expect(
      within(status)
        .getAllByRole('option')
        .map((o) => o.textContent)
    ).toEqual([
      'Todos',
      'Planejado',
      'Em implementação',
      'Em validação',
      'Em correção',
      'Concluído'
    ]);
    await userEvent.selectOptions(status, 'EM_CORRECAO');
    expect(changed).toHaveBeenCalledWith('requirementStatus', 'EM_CORRECAO');
    expect(screen.getByLabelText('Situação detalhada')).toBeVisible();
  });
  it('places short overview copy next to the title block', () => {
    render(<RequirementSummary />);
    const copy = screen.getByText('Estado atual dos requisitos e de sua evolução rastreável.');
    expect(copy.parentElement).toHaveClass('sprints-summary__heading');
  });
  it.each([
    ['ABERTO', 'Detecção'],
    ['EM_CORRECAO', 'Correção'],
    ['AGUARDANDO_RETESTE', 'Reteste'],
    ['VALIDADO', 'Validado']
  ])('shows the current phase of %s without changing actions', (status, phase) => {
    render(
      <DefectCard
        defect={{
          id: 1,
          displayId: 'DEF-1',
          title: 'Falha',
          status,
          severity: 'BAIXA',
          currentCorrectionCycle: 1,
          responsibleUser: { id: 1, name: 'Daniel' },
          correctionTaskCount: 0
        }}
        canWrite
        onOpen={() => {}}
      />
    );
    const trail = screen.getByRole('list', { name: 'Evolução do defeito' });
    expect(within(trail).getByLabelText(`${phase}: Atual`)).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('button', { name: 'Histórico' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Retestar' }) !== null).toBe(
      status === 'AGUARDANDO_RETESTE'
    );
  });
});
