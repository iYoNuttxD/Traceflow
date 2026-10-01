import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { ConfirmProvider } from '../../src/shared/index.js';
import { fixture, node } from '../helpers/expanded-graph.js';
import { testCase } from '../testCases/fixtures.js';
import { defect } from '../defects/fixtures.js';
import { TraceabilityFlow } from '../../src/features/traceability/components/TraceabilityFlow.jsx';
import { TraceabilityInspector } from '../../src/features/traceability/components/TraceabilityInspector.jsx';
import { WorkspaceSummary } from '../../src/features/traceability/components/TraceabilityWorkspace.jsx';
import { TraceabilityHelp } from '../../src/features/traceability/components/TraceabilityHelp.jsx';
const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  caseDetail: vi.fn(),
  defectDetail: vi.fn(),
  realDetails: false,
  task: vi.fn(),
  entries: vi.fn(),
  createEntry: vi.fn(),
  layout: vi.fn(),
  props: null,
  center: vi.fn(),
  viewport: vi.fn()
}));
vi.mock('../../src/features/testCases/api/test-cases.api.js', () => ({
  testCasesApi: { detail: mocks.caseDetail }
}));
vi.mock('../../src/features/defects/api/defects.api.js', () => ({
  defectsApi: { detail: mocks.defectDetail }
}));
vi.mock('../../src/features/traceability/api/traceability.api.js', () => ({
  getRequirementTraceability: mocks.api
}));
vi.mock('../../src/features/traceability/graph/layout/elk-layout.js', async (importOriginal) => ({
  ...(await importOriginal()),
  layoutWithElk: mocks.layout
}));
vi.mock('../../src/features/traceability/components/GraphEntityDetails.jsx', async (original) => {
  const { GraphEntityDetails } = await original();
  return {
    GraphEntityDetails: (props) =>
      mocks.realDetails ? (
        <GraphEntityDetails {...props} />
      ) : (
        <section>Conteúdo canônico {props.node.type}</section>
      )
  };
});
vi.mock('../../src/features/tasks/api/tasks.api.js', async (original) => ({
  ...(await original()),
  tasksApi: { get: mocks.task },
  getTaskTimeEntries: mocks.entries,
  createTaskTimeEntry: mocks.createEntry
}));
vi.mock('../../src/features/tasks/components/TaskComments.jsx', () => ({
  TaskComments: () => null
}));
vi.mock('../../src/features/tasks/components/TaskQuality.jsx', () => ({ TaskQuality: () => null }));
vi.mock('@xyflow/react', () => {
  // React Flow exposes a stable instance; state updates must not simulate a new viewport owner.
  const flow = {
    getNode: (id) => mocks.props?.nodes.find((n) => n.id === id),
    getNodes: () => mocks.props?.nodes || [],
    setCenter: mocks.center,
    setViewport: mocks.viewport
  };
  return {
    applyNodeChanges: (changes, nodes) =>
      nodes.map((n) => ({
        ...n,
        position: changes.find((c) => c.id === n.id && c.position)?.position || n.position
      })),
    BaseEdge: () => null,
    EdgeLabelRenderer: ({ children }) => children,
    getSmoothStepPath: () => ['M0 0', 0, 0],
    MarkerType: { ArrowClosed: 'arrow' },
    Position: { Left: 'left', Right: 'right' },
    Handle: () => null,
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    useUpdateNodeInternals: () => () => {},
    ReactFlowProvider: ({ children }) => children,
    useReactFlow: () => flow,
    ReactFlow: (props) => {
      mocks.props = props;
      return (
        <div onKeyDown={props.onKeyDown}>
          {props.nodes.map((n) => {
            const Component = props.nodeTypes[n.type];
            return (
              <div
                key={n.id}
                className="react-flow__node"
                data-id={n.id}
                tabIndex={0}
                data-testid={n.id}
                data-position={JSON.stringify(n.position)}
              >
                <Component id={n.id} data={n.data} />
              </div>
            );
          })}
        </div>
      );
    }
  };
});
const mount = (g) =>
  render(
    <MemoryRouter>
      <ConfirmProvider>
        <TraceabilityFlow traceability={g} />
      </ConfirmProvider>
    </MemoryRouter>
  );
async function ready() {
  await screen.findByRole('button', { name: 'Inspecionar Requisito REQ-1' });
}
async function select(name) {
  fireEvent.click(await screen.findByRole('button', { name: `Inspecionar ${name}` }));
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.props = null;
  mocks.realDetails = false;
  mocks.layout.mockImplementation(async (view) => ({
    nodes: view.nodes.map((n, i) => ({ id: n.id, position: { x: i * 400, y: 0 }, ports: [] })),
    edges: view.edges,
    duration: 1
  }));
});
describe('Workspace interactions', () => {
  it('allows native group-button keyboard activation without the canvas swallowing Enter', async () => {
    mount(fixture());
    await ready();
    const user = userEvent.setup();
    const button = screen.getByRole('button', { name: 'Expandir 7 Commit de REQ-1' });
    button.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('button', { name: 'Recolher Commit de REQ-1' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });
  it('selects without changing card geometry, switches Inspector, then clears', async () => {
    mount(fixture());
    await ready();
    const before = screen.getByTestId('testCase:4').getAttribute('data-position');
    await select('Caso de teste TC-4');
    expect(screen.getByRole('complementary')).toHaveAccessibleName('Inspector de TC-4');
    expect(screen.getByTestId('testCase:4')).toHaveAttribute('data-position', before);
    await select('Defeito DEF-3');
    expect(screen.getByRole('complementary')).toHaveAccessibleName('Inspector de DEF-3');
    fireEvent.click(screen.getByText('Fechar Inspector'));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(mocks.layout).toHaveBeenCalledTimes(1);
  });
  it('keeps the explicitly chosen relation when obsolete selection changes arrive', async () => {
    mount(fixture());
    await ready();
    await select('Requisito REQ-1');
    fireEvent.click(
      within(screen.getByRole('complementary')).getByRole('button', { name: /TC-4/ })
    );
    act(() =>
      mocks.props.onNodesChange([
        { type: 'select', id: 'requirement:1', selected: true },
        { type: 'select', id: 'testCase:4', selected: false }
      ])
    );
    expect(screen.getByRole('complementary')).toHaveAccessibleName('Inspector de TC-4');
    expect(mocks.props.nodes.find((n) => n.id === 'testCase:4').selected).toBe(true);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'TC-4', exact: true })).toHaveFocus()
    );
    expect(mocks.layout).toHaveBeenCalledTimes(1);
  });
  it('shows the full semantic label on individual edge hover and keyboard focus', async () => {
    mount(fixture());
    await ready();
    const edge = mocks.props.edges.find((e) => e.relationType === 'DETECTOU');
    act(() => mocks.props.onEdgeMouseEnter({}, edge));
    expect(mocks.props.edges.find((e) => e.id === edge.id).label).toContain('detectou');
    act(() => mocks.props.onEdgeMouseLeave());
    expect(mocks.props.edges.find((e) => e.id === edge.id).label).toBeUndefined();
    const element = document.createElement('g');
    element.classList.add('react-flow__edge');
    element.setAttribute('data-id', edge.id);
    act(() => mocks.props.onFocus({ target: element }));
    expect(mocks.props.edges.find((e) => e.id === edge.id).label).toContain('detectou');
  });
  it('rejects late automatic layout after a manual movement', async () => {
    mount(fixture());
    await ready();
    const pending = deferred();
    mocks.layout.mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByText('Organizar automaticamente'));
    act(() =>
      mocks.props.onNodesChange([{ type: 'position', id: 'task:2', position: { x: 456, y: 789 } }])
    );
    await act(async () =>
      pending.resolve({
        nodes: mocks.props.nodes.map((n) => ({ id: n.id, position: { x: 0, y: 0 }, ports: [] })),
        edges: [],
        duration: 10
      })
    );
    expect(screen.getByTestId('task:2')).toHaveAttribute(
      'data-position',
      JSON.stringify({ x: 456, y: 789 })
    );
    expect(screen.getByText('Organizar automaticamente')).not.toBeDisabled();
  });
  it('preserves manual positions through selection, groups and Details; organize explicitly resets', async () => {
    mount(fixture());
    await ready();
    act(() =>
      mocks.props.onNodesChange([
        { type: 'position', id: 'task:2', position: { x: 999, y: 555 }, dragging: false }
      ])
    );
    await select('Tarefa TASK-2');
    fireEvent.click(screen.getByText('Abrir detalhes'));
    expect(screen.getByText('Conteúdo canônico TASK')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('← Voltar para o fluxo'));
    fireEvent.click(screen.getByRole('button', { name: 'Expandir 7 Commit de REQ-1' }));
    await screen.findByRole('button', { name: 'Inspecionar Commit abc0123' });
    expect(screen.getByTestId('task:2')).toHaveAttribute(
      'data-position',
      JSON.stringify({ x: 999, y: 555 })
    );
    expect(mocks.layout).toHaveBeenCalledTimes(1);
    expect(mocks.api).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Organizar automaticamente'));
    await waitFor(() => expect(mocks.layout).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByTestId('task:2')).not.toHaveAttribute(
        'data-position',
        JSON.stringify({ x: 999, y: 555 })
      )
    );
  });
  it('highlights hover and focus, pins selection, dims without hiding', async () => {
    mount(fixture());
    await ready();
    const task = mocks.props.nodes.find((n) => n.id === 'task:2');
    act(() => mocks.props.onNodeMouseEnter({}, task));
    expect(mocks.props.edges.some((e) => e.className.includes('highlight'))).toBe(true);
    expect(mocks.props.nodes.some((n) => n.className === 'trace-node-dim')).toBe(true);
    act(() => mocks.props.onNodeMouseLeave());
    expect(mocks.props.edges.some((e) => e.className.includes('highlight'))).toBe(false);
    await select('Defeito DEF-3');
    act(() => mocks.props.onNodeMouseLeave());
    expect(mocks.props.edges.some((e) => e.className.includes('highlight'))).toBe(true);
    expect(mocks.props.nodes).toHaveLength(8);
  });
  it('configures bounded zoom and draggable nodes; native movement requires browser QA', async () => {
    mount(fixture());
    await ready();
    expect(mocks.props.minZoom).toBeGreaterThanOrEqual(0.2);
    expect(mocks.props.minZoom).toBeLessThanOrEqual(0.25);
    expect(mocks.props.nodesDraggable).toBe(true);
    fireEvent.click(screen.getByText('Centralizar fluxo'));
    expect(mocks.center).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ zoom: 0.9 })
    );
    expect(screen.getByRole('button', { name: 'Inspecionar Tarefa TASK-2' })).toHaveClass('nodrag');
  });
  it.each([
    ['Tarefa TASK-2', 'TASK'],
    ['Caso de teste TC-4', 'TEST_CASE'],
    ['Execução EXEC-0008', 'TEST_EXECUTION'],
    ['Defeito DEF-3', 'DEFECT']
  ])('reuses Details content for %s in a subview', async (name, type) => {
    mount(fixture());
    await ready();
    await select(name);
    fireEvent.click(screen.getByText('Abrir detalhes'));
    expect(screen.getByText(`Conteúdo canônico ${type}`)).toBeVisible();
    fireEvent.click(screen.getByText('← Voltar para o fluxo'));
    expect(screen.getByRole('complementary')).toBeVisible();
  });
  it('ignores append after collapse and allows a fresh request', async () => {
    const g = fixture();
    g.pagination.totalPages = 2;
    const request = deferred();
    mocks.api.mockReturnValueOnce(request.promise);
    mount(g);
    await ready();
    fireEvent.click(screen.getByText('Carregar mais relações'));
    fireEvent.click(screen.getByText('Recolher tudo'));
    await act(async () =>
      request.resolve({
        ...g,
        nodes: [node('TASK', 88)],
        edges: [],
        pagination: { ...g.pagination, page: 2 }
      })
    );
    expect(screen.queryByText('TASK-88')).not.toBeInTheDocument();
    mocks.api.mockResolvedValue({
      ...g,
      nodes: [node('TASK', 89)],
      edges: [],
      pagination: { ...g.pagination, page: 2 }
    });
    fireEvent.click(screen.getByText('Carregar mais relações'));
    await screen.findByRole('button', { name: 'Inspecionar Tarefa TASK-89' });
  });
  it('rejects old layout after Requirement switch', async () => {
    const old = deferred();
    mocks.layout.mockReturnValueOnce(old.promise);
    const g = fixture();
    const view = mount(g);
    const next = {
      ...g,
      perspective: { id: 10, type: 'REQUIREMENT' },
      nodes: [node('REQUIREMENT', 10)],
      edges: []
    };
    view.rerender(
      <MemoryRouter>
        <TraceabilityFlow traceability={next} />
      </MemoryRouter>
    );
    await screen.findByRole('button', { name: 'Inspecionar Requisito REQ-10' });
    await act(async () => old.resolve({ nodes: [], edges: [], duration: 1 }));
    expect(screen.getByRole('button', { name: 'Inspecionar Requisito REQ-10' })).toBeVisible();
  });
  it.each(['resolve', 'reject'])(
    'rejects a stale page %s after Requirement switch',
    async (outcome) => {
      const pending = deferred();
      const g = fixture();
      g.pagination.totalPages = 2;
      mocks.api.mockReturnValueOnce(pending.promise);
      const view = mount(g);
      await ready();
      fireEvent.click(screen.getByText('Carregar mais relações'));
      expect(mocks.api).toHaveBeenCalledWith(
        1,
        1,
        { expanded: true, limit: 100, page: 2 },
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
      const next = {
        ...g,
        perspective: { id: 10, type: 'REQUIREMENT' },
        nodes: [node('REQUIREMENT', 10)],
        edges: [],
        pagination: { ...g.pagination, totalPages: 1 }
      };
      view.rerender(
        <MemoryRouter>
          <ConfirmProvider>
            <TraceabilityFlow traceability={next} />
          </ConfirmProvider>
        </MemoryRouter>
      );
      await screen.findByRole('button', { name: 'Inspecionar Requisito REQ-10' });
      await act(async () =>
        outcome === 'resolve'
          ? pending.resolve({
              ...g,
              nodes: [node('TASK', 88)],
              edges: [],
              pagination: { ...g.pagination, page: 2 }
            })
          : pending.reject(new Error('Falha antiga'))
      );
      expect(screen.getByRole('button', { name: 'Inspecionar Requisito REQ-10' })).toBeVisible();
      expect(screen.queryByTestId('task:88')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(mocks.props.nodes.map((n) => n.id)).toEqual(['requirement:10']);
    }
  );
  it('retains graph and recovers the same page through contextual retry without duplicates', async () => {
    const g = fixture();
    g.pagination.totalPages = 2;
    mocks.api.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({
      ...g,
      nodes: [g.nodes[0], node('TASK', 88)],
      edges: [],
      pagination: { ...g.pagination, page: 2 }
    });
    mount(g);
    await ready();
    fireEvent.click(screen.getByText('Carregar mais relações'));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Inspecionar Requisito REQ-1' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/i }));
    await screen.findByRole('button', { name: 'Inspecionar Tarefa TASK-88' });
    expect(mocks.api).toHaveBeenCalledTimes(2);
    for (const args of mocks.api.mock.calls)
      expect(args.slice(0, 3)).toEqual([1, 1, { expanded: true, limit: 100, page: 2 }]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('requirement:1')).toHaveLength(1);
    expect(screen.queryByText('Carregar mais relações')).not.toBeInTheDocument();
  });
  it.each(['TEST_CASE', 'DEFECT'])(
    'loads real %s details and returns to its inspector',
    async (type) => {
      mocks.realDetails = true;
      mocks.caseDetail.mockResolvedValue({
        ...structuredClone(testCase),
        id: 4,
        displayId: 'TC-4'
      });
      mocks.defectDetail.mockResolvedValue({
        ...structuredClone(defect),
        id: 3,
        displayId: 'DEF-3'
      });
      mount(fixture());
      await ready();
      await select(type === 'TEST_CASE' ? 'Caso de teste TC-4' : 'Defeito DEF-3');
      fireEvent.click(screen.getByText('Abrir detalhes'));
      expect(
        await screen.findByText(type === 'TEST_CASE' ? 'Cenário de validação' : 'Falha confirmada')
      ).toBeVisible();
      expect(
        screen.getByText(type === 'TEST_CASE' ? 'Conta disponível' : 'Falha observada')
      ).toBeVisible();
      const api = type === 'TEST_CASE' ? mocks.caseDetail : mocks.defectDetail;
      expect(api).toHaveBeenCalledWith(
        type === 'TEST_CASE' ? 4 : 3,
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
      expect(screen.queryByRole('button', { name: /^Editar/ })).not.toBeInTheDocument();
      fireEvent.click(screen.getByText('← Voltar para o fluxo'));
      expect(screen.getByRole('complementary')).toHaveAccessibleName(
        type === 'TEST_CASE' ? 'Inspector de TC-4' : 'Inspector de DEF-3'
      );
    }
  );
  it('restores default collection and closes Inspector', async () => {
    mount(fixture());
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Expandir 7 Commit de REQ-1' }));
    await screen.findByRole('button', { name: 'Inspecionar Commit abc0123' });
    await select('Defeito DEF-3');
    fireEvent.click(screen.getByText('Recolher tudo'));
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Inspecionar Commit abc0123' })
      ).not.toBeInTheDocument()
    );
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });
});
describe('Explainability', () => {
  it('separates phase, situation and authoritative implementation progress', () => {
    render(
      <WorkspaceSummary
        projection={{
          situation: 'EM_CORRECAO',
          progress: { percentage: 75, tasksDone: 3, tasksTotal: 4 }
        }}
      />
    );
    expect(screen.getByRole('listitem', { name: 'Correção: Atual' })).toHaveAttribute(
      'aria-current',
      'step'
    );
    expect(screen.getByText('Em correção')).toBeVisible();
    expect(screen.getByText('75%')).toBeVisible();
  });
  it('offers keyboard help and Escape closes help only', () => {
    render(<TraceabilityHelp topic="progress" />);
    const button = screen.getByRole('button');
    fireEvent.focus(button);
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Testes e defeitos não alteram este percentual'
    );
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
  it.each([
    ['REQUIREMENT', { status: 'PLANEJADO' }, 'Status', 'Planejado'],
    ['TASK', { responsible: 'Responsável específico' }, 'Responsável', 'Responsável específico'],
    ['TEST_CASE', { currentVersion: 7, status: 'ATIVO' }, 'Versão atual', 'v7'],
    [
      'TEST_EXECUTION',
      {
        result: 'PASS',
        environment: 'LOCAL',
        executedByDisplayNameSnapshot: 'Executor histórico',
        testCaseId: 4,
        testCaseVersion: 2
      },
      'Executor',
      'Executor histórico'
    ],
    [
      'DEFECT',
      { currentCorrectionCycle: 3, detectedStep: { executionId: 5, position: 2 } },
      'Ciclo atual',
      '3'
    ],
    ['PULL_REQUEST', { number: 44, state: 'MERGED' }, 'Estado', 'MERGED'],
    [
      'COMMIT',
      { hash: 'fedcba987654321', authorName: 'Autor original' },
      'Hash',
      'fedcba987654321'
    ],
    ['ISSUE', { number: 55, authorUsername: 'qa-autor' }, 'Autor', 'qa-autor']
  ])(
    'explains %s metadata, navigable relations and empty state in shared surfaces',
    (type, data, label, expected) => {
      const n = {
        id: `subject:${type}`,
        type,
        data: { id: 100, title: 'Artefato específico', ...data }
      };
      const target = node('TASK', 91, { title: 'Destino independente' });
      const contract = {
        nodes: [n, target],
        edges: [
          { id: 'known-relation', source: n.id, target: target.id, relationType: 'IMPLEMENTA' }
        ]
      };
      const onSelect = vi.fn();
      const props = { node: n, contract, onSelect, onClose: vi.fn(), onDetails: vi.fn() };
      const view = render(<TraceabilityInspector {...props} />);
      const info = screen.getByRole('region', { name: 'Informações' });
      expect(info).toHaveClass('detail-surface');
      expect(within(info).getByText(label).nextElementSibling).toHaveTextContent(expected);
      expect(screen.getByRole('heading', { name: 'Artefato específico' })).toBeVisible();
      const relations = screen.getByRole('region', { name: 'Relações na cadeia' });
      expect(relations).toHaveClass('detail-surface');
      expect(within(relations).getAllByRole('listitem')).toHaveLength(1);
      fireEvent.click(
        within(relations).getByRole('button', { name: 'TASK-91 · Destino independente' })
      );
      expect(onSelect).toHaveBeenCalledExactlyOnceWith('task:91');
      view.rerender(<TraceabilityInspector {...props} contract={{ ...contract, edges: [] }} />);
      expect(
        within(screen.getByRole('region', { name: 'Relações na cadeia' })).getByText(
          'Nenhuma relação carregada.'
        )
      ).toBeVisible();
      expect(
        screen.queryByRole('button', { name: 'TASK-91 · Destino independente' })
      ).not.toBeInTheDocument();
      expect(mocks.api).not.toHaveBeenCalled();
    }
  );
  it('uses full count rather than compact metadata length', () => {
    const g = fixture(),
      n = g.nodes.find((n) => n.type === 'DEFECT');
    n.data.correctionTaskCount = 6;
    render(<TraceabilityInspector node={n} contract={g} />);
    expect(
      within(screen.getByRole('complementary')).getByText('Tarefas de correção').nextElementSibling
    ).toHaveTextContent('6');
  });
});

describe('Confirmed effort in graph-owned Task Details', () => {
  it.each(['late response', 'read failure'])(
    'keeps confirmed effort and workspace after %s',
    async (outcome) => {
      mocks.realDetails = true;
      const g = fixture();
      const task = {
        ...g.nodes.find((n) => n.id === 'task:2').data,
        projectId: g.projectId,
        estimatedEffort: 5,
        actualEffort: 4,
        status: 'EM_ANDAMENTO',
        priority: 'MEDIA',
        commits: [],
        issues: []
      };
      g.nodes.find((n) => n.id === 'task:2').data = task;
      g.nodes.push(node('TASK', 30, { estimatedEffort: 10, actualEffort: 1 }));
      g.pagination.totalPages = 2;
      const effort = (hours) => ({
        unit: 'HOURS',
        estimatedHours: 5,
        completedSeconds: hours * 3600,
        actualHours: hours,
        completedCount: 1,
        running: null
      });
      mocks.task.mockResolvedValue({ data: { task } });
      mocks.entries.mockResolvedValue({
        entries: [],
        running: null,
        effort: effort(4),
        permissions: { canOperate: true },
        pagination: { page: 1, total: 0, totalPages: 0 }
      });
      mocks.createEntry.mockResolvedValue({
        entry: { id: 50, taskId: 2, source: 'MANUAL', durationSeconds: 10800 },
        effort: effort(7)
      });
      let finishPage;
      mocks.api.mockImplementation(
        () =>
          new Promise((resolve, reject) => {
            finishPage = () =>
              outcome === 'read failure'
                ? reject({ response: { status: 503, data: { message: 'Leitura indisponível' } } })
                : resolve({ ...g, pagination: { ...g.pagination, page: 2 } });
          })
      );
      mount(g);
      await ready();
      fireEvent.click(screen.getByRole('button', { name: 'Expandir 7 Commit de REQ-1' }));
      await screen.findByRole('button', { name: 'Inspecionar Commit abc0123' });
      act(() =>
        mocks.props.onNodesChange([
          { type: 'position', id: 'task:2', position: { x: 999, y: 555 } }
        ])
      );
      await select('Tarefa TASK-2');
      expect(within(screen.getByRole('complementary')).getByText('4h')).toBeVisible();
      fireEvent.click(screen.getByText('Carregar mais relações'));
      fireEvent.click(screen.getByText('Abrir detalhes'));
      const user = userEvent.setup();
      const effortPanel = await screen.findByRole('region', { name: 'Esforço (horas)' });
      await waitFor(() =>
        expect(within(effortPanel).getByRole('button', { name: 'Retomar' })).toBeEnabled()
      );
      await user.click(within(effortPanel).getByRole('button', { name: 'Lançar manualmente' }));
      const layoutCount = mocks.layout.mock.calls.length;
      const centerCount = mocks.center.mock.calls.length;
      const viewportCount = mocks.viewport.mock.calls.length;
      await user.type(screen.getByLabelText('Horas'), '3');
      await user.click(screen.getByRole('button', { name: 'Salvar lançamento' }));
      expect(await screen.findByText('7h de 5h estimadas')).toBeVisible();
      expect(mocks.createEntry).toHaveBeenCalledExactlyOnceWith(2, { hours: '3' });
      fireEvent.click(screen.getByText('← Voltar para o fluxo'));
      const inspector = screen.getByRole('complementary');
      expect(within(inspector).getByText('7h')).toBeVisible();
      expect(within(inspector).getByText('140%')).toBeVisible();
      expect(mocks.props.nodes.find((n) => n.id === 'task:2').data.node.data.actualEffort).toBe(7);
      expect(mocks.layout).toHaveBeenCalledTimes(layoutCount);
      expect(mocks.center).toHaveBeenCalledTimes(centerCount);
      expect(mocks.viewport).toHaveBeenCalledTimes(viewportCount);
      expect(screen.getByTestId('task:2')).toHaveAttribute(
        'data-position',
        JSON.stringify({ x: 999, y: 555 })
      );
      expect(screen.getByRole('button', { name: 'Recolher Commit de REQ-1' })).toBeVisible();
      await select('Tarefa TASK-30');
      await act(async () => finishPage());
      expect(screen.getByRole('complementary')).toHaveAccessibleName('Inspector de TASK-30');
      expect(within(screen.getByRole('complementary')).getByText('1h')).toBeVisible();
      if (outcome === 'read failure')
        expect(screen.getByRole('alert')).toHaveTextContent(
          'O serviço está temporariamente indisponível. Tente novamente em instantes.'
        );
      await select('Tarefa TASK-2');
      expect(within(screen.getByRole('complementary')).getByText('7h')).toBeVisible();
      fireEvent.click(screen.getByText('Recolher tudo'));
      await select('Tarefa TASK-2');
      expect(within(screen.getByRole('complementary')).getByText('140%')).toBeVisible();
    }
  );
});
