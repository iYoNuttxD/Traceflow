import { describe, it, expect } from 'vitest';
import { macroPhase } from '../../src/features/traceability/model/phase.js';
import {
  graphLayout,
  layoutWithElk,
  graphPorts,
  placeNewNodes,
  highlightedPath
} from '../../src/features/traceability/graph/layout/elk-layout.js';
import { presentGraph } from '../../src/features/traceability/model/graph.js';
import { fixture } from '../helpers/expanded-graph.js';
describe('Presentation phases', () => {
  it.each([
    ['SEM_RASTREABILIDADE', 'PLANNING'],
    ['PLANEJADO', 'PLANNING'],
    ['EM_DESENVOLVIMENTO', 'IMPLEMENTATION'],
    ['IMPLEMENTADO', 'IMPLEMENTATION'],
    ['AGUARDANDO_VALIDACAO', 'VALIDATION'],
    ['EM_VALIDACAO', 'VALIDATION'],
    ['VALIDADO', 'VALIDATION'],
    ['COM_FALHA', 'CORRECTION'],
    ['EM_CORRECAO', 'CORRECTION'],
    ['AGUARDANDO_RETESTE', 'CORRECTION'],
    ['CONCLUIDO', 'CONCLUSION']
  ])('%s maps only to visual phase %s', (s, p) => expect(macroPhase(s)).toBe(p));
  it('does not invent phase for unknown situation', () => expect(macroPhase('UNKNOWN')).toBeNull());
});
describe('Real ELK layout', () => {
  it('is deterministic, routes ports and starts nodes without overlap', async () => {
    const view = presentGraph(fixture());
    const a = await layoutWithElk(view),
      b = await layoutWithElk(view);
    expect(a.nodes).toEqual(b.nodes);
    for (const n of a.nodes)
      for (const m of a.nodes)
        if (n.id !== m.id)
          expect(
            Math.abs(n.position.x - m.position.x) >= graphLayout.width ||
              Math.abs(n.position.y - m.position.y) >= graphLayout.height
          ).toBe(true);
    expect(a.edges.every((e) => e.sections?.length)).toBe(true);
    const ports = new Set(a.nodes.flatMap((n) => n.ports.map((p) => p.id)));
    expect(a.edges.every((e) => ports.has(e.sourceHandle) && ports.has(e.targetHandle))).toBe(true);
  });
  it('lays out an implementation chain left to right', async () => {
    const g = fixture();
    g.nodes = g.nodes.filter((n) => ['REQUIREMENT', 'TASK', 'COMMIT'].includes(n.type));
    g.edges = g.edges.filter((e) => ['IMPLEMENTA', 'IMPLEMENTADO_EM'].includes(e.relationType));
    g.nodes.forEach((n) => {
      if (n.type === 'TASK') n.data.correctionDefects = [];
    });
    const layout = await layoutWithElk(g);
    const positions = new Map(layout.nodes.map((n) => [n.id, n.position]));
    for (const e of g.edges)
      expect(positions.get(e.target).x).toBeGreaterThan(positions.get(e.source).x);
  });
  it('assigns unique handles, stable order and context hierarchy from actual edges', () => {
    const g = fixture(),
      a = graphPorts(g),
      b = graphPorts({ ...g, edges: [...g.edges].reverse() });
    expect(a).toEqual(b);
    const ids = [...a.ports.values()].flat().map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      a.edges.find((e) => e.source === 'requirement:1' && e.target === 'testCase:4').hierarchy
    ).toBe('secondary');
  });
  it('keeps manual coordinates while adding all new group members without collisions', () => {
    const g = fixture(),
      base = presentGraph(g),
      positions = new Map(base.nodes.map((n, i) => [n.id, { x: i * 400, y: 100 }]));
    positions.set('task:2', { x: 900, y: 1200 });
    const expanded = presentGraph(
      g,
      base.nodes.filter((n) => n.type === 'GROUP').map((n) => n.id)
    );
    const next = placeNewNodes(expanded, positions);
    for (const [id, p] of positions) expect(next.get(id)).toEqual(p);
    expect(next.size).toBe(expanded.nodes.length);
  });
  it('focuses semantic neighbours without hiding unrelated entities', () => {
    const g = fixture(),
      p = highlightedPath(g, 'defect:3');
    expect(p.nodes.has('task:2')).toBe(true);
    expect(p.nodes.has('execution:5')).toBe(true);
    expect(p.nodes.has('execution:8')).toBe(true);
    expect(p.nodes.has('commit:20')).toBe(false);
    expect(highlightedPath(g, null).edges.size).toBe(0);
  });
});
