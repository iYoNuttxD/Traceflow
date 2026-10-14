import { describe, expect, it } from 'vitest';
import { buildFlow } from '../../src/features/traceability/components/TraceabilityFlow.jsx';

describe('TraceabilityFlow canônico', () => {
  it('preserva o contrato canônico de nós e arestas sem reconstruí-lo', () => {
    const contract = {
      perspective: { type: 'REQUIREMENT', id: 1 },
      nodes: [
        { id: 'requirement:1', type: 'REQUIREMENT', data: { id: 1, title: 'RF' } },
        { id: 'task:2', type: 'TASK', data: { id: 2, title: 'Task' } },
        { id: 'commit:3', type: 'COMMIT', data: { id: 3, message: 'Commit' } }
      ],
      edges: [
        { id: 'edge-1', type: 'REQUIREMENT_TASK', source: 'requirement:1', target: 'task:2' },
        { id: 'edge-2', type: 'TASK_COMMIT', source: 'task:2', target: 'commit:3' }
      ]
    };
    const flow = buildFlow(contract);
    expect(flow.nodes.map((node) => node.id)).toEqual(['requirement:1', 'task:2', 'commit:3']);
    expect(flow.edges.map(({ id, source, target }) => ({ id, source, target }))).toEqual([
      { id: 'edge-1', source: 'requirement:1', target: 'task:2' },
      { id: 'edge-2', source: 'task:2', target: 'commit:3' }
    ]);
    expect(flow.nodes.map((n) => n.data.node)).toEqual(contract.nodes);
    expect(flow.edges.map((e) => e.data.relationType)).toEqual(['REQUIREMENT_TASK', 'TASK_COMMIT']);
    expect(buildFlow({ nodes: [], edges: [] })).toEqual({ nodes: [], edges: [] });
  });
});
