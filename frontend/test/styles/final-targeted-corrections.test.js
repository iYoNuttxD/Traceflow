import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(resolve(path), 'utf8');

describe('frontend final targeted corrections', () => {
  it('preserva o touch target canônico nos owners compartilhados', () => {
    expect(read('src/styles/global.css')).toMatch(
      /\.button(?:[^}]|\n)*min-height:\s*var\(--size-touch-target\)/
    );
    expect(read('src/features/traceability/components/TraceabilityHelp.css')).toMatch(
      /\.trace-help-trigger(?:[^}]|\n)*min-width:\s*var\(--size-touch-target\)/
    );
    expect(read('src/features/tasks/components/TaskCorrectionContext.css')).toMatch(
      /\.task-correction-badge a(?:[^}]|\n)*min-width:\s*var\(--size-touch-target\)/
    );
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
