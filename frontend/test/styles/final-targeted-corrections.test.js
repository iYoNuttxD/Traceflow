import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseStylesheet, ruleDeclarations } from '../helpers/css-rules.js';

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
