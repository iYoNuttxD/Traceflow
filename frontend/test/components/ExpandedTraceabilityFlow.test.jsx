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
    expect(
      view.edges
        .filter((edge) => !edge.presentation)
        .map(({ source, target, relationType }) => [source, target, relationType])
    ).toEqual([
      ['requirement:1', 'task:2', 'IMPLEMENTA'],
      ['requirement:1', 'testCase:4', 'VERIFICADO_POR'],
      ['task:2', 'testCase:4', 'VERIFICADO_POR'],
      ['execution:5', 'defect:3', 'DETECTOU'],
      ['defect:3', 'task:2', 'CORRIGIDO_POR'],
      ['defect:3', 'execution:8', 'RETESTADO_POR'],
      ['testCase:4', 'execution:5', 'EXECUTADO_EM'],
      ['testCase:4', 'execution:8', 'EXECUTADO_EM']
    ]);
    const ids = new Set(view.nodes.map((n) => n.id));
    for (const edge of view.edges) {
      expect(ids.has(edge.source)).toBe(true);
      expect(ids.has(edge.target)).toBe(true);
    }
  });
  it('can expand and collapse repeatedly without losing shared endpoints', () => {
    const g = fixture(),
      keys = presentGraph(g)
        .nodes.filter((n) => n.type === 'GROUP')
        .map((n) => n.id);
    for (const expanded of [[], [keys[0]], keys, [keys[1]], []]) {
      const view = presentGraph(g, expanded);
      const expectedIds = g.nodes
        .filter((n) => n.type !== 'COMMIT' && (n.type !== 'TEST_EXECUTION' || n.data.required))
        .map((n) => n.id);
      if (expanded.includes(keys[0])) expectedIds.push('execution:6', 'execution:7', 'execution:9');
      if (expanded.includes(keys[1]))
        expectedIds.push(...Array.from({ length: 7 }, (_, i) => 'commit:' + (20 + i)));
      expect(
        view.nodes
          .filter((n) => n.type !== 'GROUP')
          .map((n) => n.id)
          .sort()
      ).toEqual(expectedIds.sort());
      expect(view.edges.filter((e) => !e.presentation)).toEqual(
        g.edges.filter((e) => expectedIds.includes(e.source) && expectedIds.includes(e.target))
      );
    }
  });
  it('keeps historical executions accessible even when their removed case is absent', () => {
    const g = fixture();
    g.nodes = g.nodes.filter((n) => n.type !== 'TEST_CASE');
    const view = presentGraph(g),
      group = view.nodes.find((n) => n.type === 'GROUP' && n.data.label === 'Execução');
    expect(group).toBeDefined();
    expect(group.data).toMatchObject({
      owner: 'requirement:1',
      memberIds: ['execution:6', 'execution:7', 'execution:9']
    });
    expect(view.edges).toContainEqual(
      expect.objectContaining({ source: 'requirement:1', target: group.id, presentation: true })
    );
    expect(
      presentGraph(g, [group.id])
        .nodes.filter((n) => n.type === 'TEST_EXECUTION')
        .map((n) => n.id)
    ).toEqual(['execution:5', 'execution:6', 'execution:7', 'execution:8', 'execution:9']);
  });
  it('carries accessible labels for every edge and never calls FAIL a validation', () => {
    const f = buildFlow(fixture());
    expect(f.edges.every((e) => e.ariaLabel)).toBe(true);
    const failed = f.edges.find((e) => e.data.relationType === 'DETECTOU');
    expect(failed.ariaLabel).toBe('execution:5 detectou · Passo 1 defect:3');
    expect(failed.ariaLabel).not.toMatch(/valid|confirm/i);
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
