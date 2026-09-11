import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import {
  TraceabilityFlow,
  buildFlow
} from '../../src/features/traceability/components/TraceabilityFlow.jsx';
import {
  presentGraph,
  layoutGraph,
  mergeGraph
} from '../../src/features/traceability/model/graph.js';
const api = vi.hoisted(() => ({ getRequirementTraceability: vi.fn() }));
vi.mock('../../src/features/traceability/api/traceability.api.js', () => api);
vi.mock('@xyflow/react', () => ({
  BaseEdge: () => null,
  EdgeLabelRenderer: ({ children }) => children,
  getSmoothStepPath: () => ['M0 0', 0, 0],
  MarkerType: { ArrowClosed: 'arrow' },
  Position: { Top: 'top', Bottom: 'bottom' },
  Handle: () => null,
  Background: () => null,
  Controls: () => null,
  ReactFlowProvider: ({ children }) => children,
  useReactFlow: () => ({ fitView: vi.fn(), setCenter: vi.fn() }),
  ReactFlow: ({ nodes, nodeTypes }) => (
    <div>
      {nodes.map((n) => {
        const Component = nodeTypes[n.type];
        return <Component key={n.id} data={n.data} />;
      })}
    </div>
  )
}));
vi.mock('../../src/features/traceability/components/GraphEntityDetails.jsx', () => ({
  GraphEntityDetails: ({ node, onClose }) => (
    <div role="dialog">
      Details reais: {node.type}
      <button onClick={onClose}>Fechar detalhes</button>
    </div>
  )
}));
const node = (type, id, data = {}) => ({
  id: `${{ REQUIREMENT: 'requirement', TASK: 'task', TEST_CASE: 'testCase', TEST_EXECUTION: 'execution', DEFECT: 'defect', COMMIT: 'commit' }[type]}:${id}`,
  entityId: id,
  type,
  data: { id, title: `Título ${id}`, ...data }
});
function fixture() {
  const root = node('REQUIREMENT', 1, { status: 'CADASTRADO' }),
    task = node('TASK', 2, { status: 'CONCLUIDO', correctionDefects: [{ id: 3 }] }),
    tc = node('TEST_CASE', 4, {
      status: 'ATIVO',
      currentVersion: 1,
      latestExecution: { id: 8, result: 'PASS' },
      taskLinks: [{ taskId: 2 }],
      executionCount: 5,
      defectCount: 1
    }),
    defect = node('DEFECT', 3, {
      severity: 'ALTA',
      status: 'VALIDADO',
      detectedStep: { executionId: 5, position: 1 },
      taskLinks: [],
      retests: []
    });
  const ex = Array.from({ length: 5 }, (_, i) =>
    node('TEST_EXECUTION', i + 5, {
      result: i === 3 ? 'PASS' : 'FAIL',
      environment: 'LOCAL',
      testCaseId: 4,
      testCaseVersion: 1,
      required: i === 0 || i === 3,
      retests: i === 3 ? [{ defectId: 3 }] : [],
      stepCounts: { FAIL: 1 },
      _count: { evidence: 0 }
    })
  );
  const commits = Array.from({ length: 7 }, (_, i) =>
    node('COMMIT', i + 20, { hash: `abc${i}123456`, message: `Commit ${i}` })
  );
  const edge = (source, target, relationType, extra = {}) => ({
    id: `${relationType}:${source}:${target}`,
    source,
    target,
    relationType,
    ...extra
  });
  return {
    projectId: 1,
    perspective: { type: 'REQUIREMENT', id: 1 },
    nodes: [root, task, tc, defect, ...ex, ...commits],
    edges: [
      edge(root.id, task.id, 'IMPLEMENTA'),
      edge(root.id, tc.id, 'VERIFICADO_POR'),
      edge(task.id, tc.id, 'VERIFICADO_POR'),
      edge('execution:5', defect.id, 'DETECTOU', { failedStep: 1 }),
      edge(defect.id, task.id, 'CORRIGIDO_POR'),
      edge(defect.id, 'execution:8', 'RETESTADO_POR'),
      ...ex.map((e) => edge(tc.id, e.id, 'EXECUTADO_EM')),
      ...commits.map((c) => edge(task.id, c.id, 'IMPLEMENTADO_EM'))
    ],
    pagination: { page: 1, limit: 100, total: 16, totalPages: 1, scope: 'graphNodes' }
  };
}
const mount = (g) =>
  render(
    <MemoryRouter>
      <TraceabilityFlow traceability={g} />
    </MemoryRouter>
  );
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe('Expanded graph identities and disclosure', () => {
  it('preserves all real relations without inventing direct links or duplicated entities', () => {
    const g = fixture();
    g.nodes.push(g.nodes[1]);
    const view = presentGraph(g);
    expect(new Set(view.nodes.map((n) => n.id)).size).toBe(view.nodes.length);
    expect(view.nodes.filter((n) => n.type === 'TASK')).toHaveLength(1);
    expect(view.edges.some((e) => e.relationType === 'CORRIGIDO_POR')).toBe(true);
    expect(view.nodes.some((n) => n.id === 'execution:8')).toBe(true);
    expect(view.nodes.some((n) => n.id === 'execution:6')).toBe(false);
    expect(view.nodes.filter((n) => n.type === 'GROUP')).toHaveLength(2);
  });
  it('can expand and collapse repeatedly without losing shared endpoints', () => {
    const g = fixture(),
      keys = presentGraph(g)
        .nodes.filter((n) => n.type === 'GROUP')
        .map((n) => n.id);
    for (let i = 0; i < 10; i++) {
      const all = presentGraph(g, keys);
      expect(all.nodes.filter((n) => n.type !== 'GROUP')).toHaveLength(g.nodes.length);
      expect(all.edges.filter((e) => !e.presentation)).toHaveLength(g.edges.length);
      expect(presentGraph(g)).toEqual(presentGraph(g, []));
    }
  });
  it('keeps historical executions accessible even when their removed case is absent', () => {
    const g = fixture();
    g.nodes = g.nodes.filter((n) => n.type !== 'TEST_CASE');
    const view = presentGraph(g),
      group = view.nodes.find((n) => n.type === 'GROUP' && n.data.label === 'Execução');
    expect(group).toBeDefined();
  });
  it('produces deterministic non-overlapping rows for bounded expanded cards', () => {
    const g = fixture(),
      view = presentGraph(g),
      expanded = view.nodes.map((n) => n.id);
    const p = layoutGraph(view.nodes, expanded);
    expect(p).toEqual(layoutGraph([...view.nodes].reverse(), expanded));
    for (const a of view.nodes)
      for (const b of view.nodes)
        if (a.id !== b.id) {
          const x = p.get(a.id),
            y = p.get(b.id);
          expect(Math.abs(x.x - y.x) >= 288 || Math.abs(x.y - y.y) >= 540).toBe(true);
        }
  });
  it('carries accessible labels for every edge and never calls FAIL a validation', () => {
    const f = buildFlow(fixture());
    expect(f.edges.every((e) => e.ariaLabel)).toBe(true);
    expect(f.edges.find((e) => e.data.relationType === 'DETECTOU').ariaLabel).toContain('Passo 1');
    expect(f.edges.find((e) => e.data.relationType === 'RETESTADO_POR').ariaLabel).toContain(
      'retestado por'
    );
  });
  it('merges repeated pages by identity without duplicate edges', () => {
    const g = fixture();
    expect(mergeGraph(g, g)).toEqual(g);
  });
});
describe('Expanded graph interactions', () => {
  it('separates metadata from collection expansion and restores default', () => {
    mount(fixture());
    fireEvent.click(screen.getByRole('button', { name: 'Expandir informações de TC-4' }));
    expect(screen.getByText('Versão atual')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Expandir informações de EXEC-0006' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Expandir 3 Execução/ }));
    expect(screen.getByRole('button', { name: 'Expandir informações de EXEC-0006' })).toBeVisible();
    fireEvent.click(screen.getByText('Recolher tudo'));
    expect(screen.queryByText('Versão atual')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Expandir informações de EXEC-0006' })
    ).not.toBeInTheDocument();
  });
  it.each([
    ['TASK-2', 'Abrir tarefa', 'TASK'],
    ['TC-4', 'Abrir caso de teste', 'TEST_CASE'],
    ['EXEC-0008', 'Abrir execução', 'TEST_EXECUTION'],
    ['DEF-3', 'Abrir defeito', 'DEFECT']
  ])('opens the canonical detail host for %s and retains expansion', (id, label, type) => {
    mount(fixture());
    fireEvent.click(screen.getByRole('button', { name: `Expandir informações de ${id}` }));
    fireEvent.click(screen.getByText(label));
    expect(screen.getByRole('dialog')).toHaveTextContent(type);
    fireEvent.click(screen.getByText('Fechar detalhes'));
    expect(screen.getByRole('button', { name: `Recolher informações de ${id}` })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });
  it('marks only correction tasks and labels the retest result', () => {
    const g = fixture();
    g.nodes.push(node('TASK', 99, { status: 'A_FAZER' }));
    mount(g);
    expect(screen.getAllByText('CORREÇÃO')).toHaveLength(1);
    expect(screen.getByText('RETESTE · DEF-3')).toBeVisible();
    expect(screen.getAllByText('PASS').length).toBeGreaterThan(0);
  });
  it('keeps complete counts when compact metadata lists are truncated', () => {
    const g = fixture();
    const tc = g.nodes.find((n) => n.type === 'TEST_CASE');
    tc.data.taskLinks = [1, 2, 3, 4].map((taskId) => ({ taskId }));
    tc.data.taskCount = 7;
    const defect = g.nodes.find((n) => n.type === 'DEFECT');
    defect.data.correctionTaskCount = 6;
    mount(g);
    fireEvent.click(screen.getByRole('button', { name: 'Expandir informações de TC-4' }));
    expect(screen.getByText('TASK-1, TASK-2, TASK-3, TASK-4 +3')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Expandir informações de DEF-3' }));
    expect(screen.getByText('Tarefas de correção').nextElementSibling).toHaveTextContent('6');
  });
  it('ignores page response after collapse, and a fresh expansion can succeed', async () => {
    const g = fixture();
    g.pagination.totalPages = 2;
    let resolve;
    api.getRequirementTraceability.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        })
    );
    mount(g);
    fireEvent.click(screen.getByText('Carregar mais relações'));
    fireEvent.click(screen.getByText('Recolher tudo'));
    await act(async () =>
      resolve({
        ...g,
        nodes: [node('TASK', 88, { status: 'A_FAZER' })],
        edges: [],
        pagination: { ...g.pagination, page: 2 }
      })
    );
    expect(screen.queryByText('TASK-88')).not.toBeInTheDocument();
    api.getRequirementTraceability.mockResolvedValue({
      ...g,
      nodes: [node('TASK', 89, { status: 'A_FAZER' })],
      edges: [],
      pagination: { ...g.pagination, page: 2 }
    });
    fireEvent.click(screen.getByText('Carregar mais relações'));
    expect(await screen.findByText('TASK-89')).toBeVisible();
  });
  it('rejects old page after selecting another requirement', async () => {
    const g = fixture();
    g.pagination.totalPages = 2;
    let resolve;
    api.getRequirementTraceability.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        })
    );
    const view = mount(g);
    fireEvent.click(screen.getByText('Carregar mais relações'));
    const next = {
      ...g,
      perspective: { type: 'REQUIREMENT', id: 10 },
      nodes: [node('REQUIREMENT', 10, { status: 'CADASTRADO' })],
      edges: [],
      pagination: { ...g.pagination, totalPages: 1 }
    };
    view.rerender(
      <MemoryRouter>
        <TraceabilityFlow traceability={next} />
      </MemoryRouter>
    );
    await act(async () => resolve(g));
    expect(screen.getByText('REQ-10')).toBeVisible();
    expect(screen.queryByText('REQ-1')).not.toBeInTheDocument();
  });
  it('keeps the graph on paging failure and offers contextual retry', async () => {
    const g = fixture();
    g.pagination.totalPages = 2;
    api.getRequirementTraceability.mockRejectedValue(new Error('Falha contextual'));
    mount(g);
    fireEvent.click(screen.getByText('Carregar mais relações'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível conectar');
    expect(screen.getByRole('button', { name: 'Expandir informações de REQ-1' })).toBeVisible();
  });
});
