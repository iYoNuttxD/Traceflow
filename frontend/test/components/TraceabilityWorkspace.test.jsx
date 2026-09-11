import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { fixture, node } from '../helpers/expanded-graph.js';
import { TraceabilityFlow } from '../../src/features/traceability/components/TraceabilityFlow.jsx';
import { TraceabilityInspector } from '../../src/features/traceability/components/TraceabilityInspector.jsx';
import { WorkspaceSummary } from '../../src/features/traceability/components/TraceabilityWorkspace.jsx';
import { TraceabilityHelp } from '../../src/features/traceability/components/TraceabilityHelp.jsx';
const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  layout: vi.fn(),
  props: null,
  center: vi.fn(),
  viewport: vi.fn()
}));
vi.mock('../../src/features/traceability/api/traceability.api.js', () => ({
  getRequirementTraceability: mocks.api
}));
vi.mock('../../src/features/traceability/graph/layout/elk-layout.js', async (importOriginal) => ({
  ...(await importOriginal()),
  layoutWithElk: mocks.layout
}));
vi.mock('../../src/features/traceability/components/GraphEntityDetails.jsx', () => ({
  GraphEntityDetails: ({ node }) => <section>Conteúdo canônico {node.type}</section>
}));
vi.mock('@xyflow/react', () => ({
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
  useReactFlow: () => ({
    getNode: (id) => mocks.props?.nodes.find((n) => n.id === id),
    getNodes: () => mocks.props?.nodes || [],
    setCenter: mocks.center,
    setViewport: mocks.viewport
  }),
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
}));
const mount = (g) =>
  render(
    <MemoryRouter>
      <TraceabilityFlow traceability={g} />
    </MemoryRouter>
  );
async function ready() {
  await screen.findByRole('button', { name: 'Inspecionar Requisito REQ-1' });
}
async function select(name) {
  fireEvent.click(await screen.findByRole('button', { name: `Inspecionar ${name}` }));
}
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.props = null;
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
  it('never forces microscopic fit and offers native draggable keyboard nodes', async () => {
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
  it('rejects old layout and page after Requirement switch', async () => {
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
  it('retains graph and offers contextual paging retry', async () => {
    const g = fixture();
    g.pagination.totalPages = 2;
    mocks.api.mockRejectedValue(new Error('offline'));
    mount(g);
    await ready();
    fireEvent.click(screen.getByText('Carregar mais relações'));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Inspecionar Requisito REQ-1' })).toBeVisible();
  });
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
  it.each(['TASK', 'TEST_CASE', 'TEST_EXECUTION', 'DEFECT', 'PULL_REQUEST', 'COMMIT', 'ISSUE'])(
    'explains %s with loaded metadata and relations only',
    (type) => {
      const g = fixture();
      const n = g.nodes.find((n) => n.type === type) || {
        id: `${type}:100`,
        type,
        data: { id: 100, number: 100, title: 'Artefato' }
      };
      render(
        <TraceabilityInspector
          node={n}
          contract={g}
          onClose={vi.fn()}
          onSelect={vi.fn()}
          onDetails={vi.fn()}
        />
      );
      expect(screen.getByRole('complementary')).toHaveTextContent('Relações na cadeia');
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
