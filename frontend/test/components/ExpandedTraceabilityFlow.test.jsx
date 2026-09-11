import { describe, it, expect } from 'vitest';
import { buildFlow } from '../../src/features/traceability/components/TraceabilityFlow.jsx';
import { presentGraph, mergeGraph } from '../../src/features/traceability/model/graph.js';
import { fixture } from '../helpers/expanded-graph.js';
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
