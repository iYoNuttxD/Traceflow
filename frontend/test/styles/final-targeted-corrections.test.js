import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseStylesheet, ruleDeclarations } from '../helpers/css-rules.js';
import { createModuleGraph, moduleDependencies } from '../helpers/module-dependencies.js';

const read = (path) => readFileSync(resolve(path), 'utf8');

describe('frontend final targeted corrections', () => {
  it('preserva o touch target canônico nos owners compartilhados', () => {
    for (const [path, selector, property] of [
      ['src/styles/global.css', '.button', 'min-height'],
      [
        'src/features/traceability/components/TraceabilityHelp.css',
        '.trace-help-trigger',
        'min-width'
      ],
      [
        'src/features/tasks/components/TaskCorrectionContext.css',
        '.task-correction-badge a',
        'min-width'
      ]
    ]) {
      expect(ruleDeclarations(parseStylesheet(read(path)), selector)[property]).toBe(
        'var(--size-touch-target)'
      );
    }
  });

  it('mantém as dependências do grafo atrás de imports dinâmicos', () => {
    const requirements = read('src/features/requirements/pages/RequirementsScreen.jsx');
    const workspace = read('src/features/traceability/components/TraceabilityWorkspace.jsx');
    const traceabilityIndex = read('src/features/traceability/index.js');
    expect(requirements).toContain("from '../../traceability/index.js'");
    expect(requirements).toContain(
      "import('../../traceability/components/TraceabilityWorkspace.jsx')"
    );
    expect(workspace).toContain("import('./TraceabilityFlow.jsx')");
    expect(traceabilityIndex).not.toContain('./components/TraceabilityFlow.jsx');
    expect(traceabilityIndex).not.toContain('./components/TraceabilityWorkspace.jsx');
    expect(traceabilityIndex).not.toContain('./pages/TraceabilityScreen.jsx');

    const graph = createModuleGraph();
    const requirementsPath = 'src/features/requirements/pages/RequirementsScreen.jsx';
    const workspacePath = 'src/features/traceability/components/TraceabilityWorkspace.jsx';
    const flowPath = 'src/features/traceability/components/TraceabilityFlow.jsx';
    expect(graph.dependenciesOf(requirementsPath)).toContainEqual({
      source: '../../traceability/components/TraceabilityWorkspace.jsx',
      dynamic: true
    });
    expect(graph.dependenciesOf(workspacePath)).toContainEqual({
      source: './TraceabilityFlow.jsx',
      dynamic: true
    });
    for (const entry of [
      'src/main.jsx',
      requirementsPath,
      workspacePath,
      'src/features/traceability/index.js'
    ]) {
      const reachable = graph.staticReachableFrom(entry);
      expect(reachable.modules, `Import eager de TraceabilityFlow via ${entry}`).not.toContain(
        resolve(flowPath)
      );
      if (entry !== workspacePath) {
        expect(reachable.modules, `Import eager do workspace via ${entry}`).not.toContain(
          resolve(workspacePath)
        );
      }
      expect(
        [...reachable.packages].filter((name) => /^(?:@xyflow\/react|elkjs)(?:\/|$)/.test(name))
      ).toEqual([]);
    }
    // Positive control: the graph must actually follow the heavy chunk to its package.
    expect(graph.staticReachableFrom(flowPath).packages).toContain('@xyflow/react');

    const fixtures = new Map([
      ['entry.jsx', "import './bridge'; const load = () => import('./lazy.jsx');"],
      ['bridge.js', "export { Flow } from './barrel';"],
      ['barrel/index.js', "export * from '../flow';"],
      ['flow.jsx', "import '@xyflow/react'; export const Flow = () => <main />;"],
      ['lazy.jsx', "import 'elkjs';"],
      ['missing-entry.js', "import './missing';"],
      ['root-entry.js', "import '/src/architecture-root-control.jsx';"]
    ]);
    const fixtureRoot = resolve('test/fixtures/import-guard');
    const rootImportPath = resolve('src/architecture-root-control.jsx');
    const fixtureGraph = createModuleGraph((path) => {
      if (path === rootImportPath) return "import '@xyflow/react';";
      const fixture = fixtures.get(path.slice(fixtureRoot.length + 1));
      if (fixture === undefined) {
        throw Object.assign(new Error(`Missing fixture: ${path}`), { code: 'ENOENT' });
      }
      return fixture;
    });
    const eager = fixtureGraph.staticReachableFrom(`${fixtureRoot}/entry.jsx`);
    expect(eager.modules).toContain(`${fixtureRoot}/flow.jsx`);
    expect(eager.packages).toEqual(new Set(['@xyflow/react']));
    expect(eager.modules).not.toContain(`${fixtureRoot}/lazy.jsx`);
    const rootImported = fixtureGraph.staticReachableFrom(`${fixtureRoot}/root-entry.js`);
    expect(rootImported.modules).toContain(rootImportPath);
    expect(rootImported.packages).toEqual(new Set(['@xyflow/react']));
    expect(
      moduleDependencies(`// import './flow.jsx';
        const text = "export * from './flow.jsx'";
        const load = () => import('./flow.jsx');`)
    ).toEqual([{ source: './flow.jsx', dynamic: true }]);
    expect(() => moduleDependencies('import {')).toThrow('Cannot inspect dependencies');
    expect(() => fixtureGraph.staticReachableFrom(`${fixtureRoot}/missing-entry.js`)).toThrow(
      'Cannot resolve local module ./missing'
    );
  });

  it('remove os resultados inline dos dois editores de rastreabilidade de Task', () => {
    const form = read('src/features/tasks/components/TaskForm.jsx');
    const editor = read('src/features/tasks/components/TaskTraceabilityEditor.jsx');
    expect(form).not.toContain('className="traceability-results"');
    expect(editor).not.toContain('className="traceability-results"');
    expect(form.match(/<SearchCombobox/g)).toHaveLength(5);
    expect(editor).toContain('<SearchCombobox');
  });
});
