import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const summaries = [
  {
    name: 'Sprints',
    css: readFileSync(resolve('src/features/schedule/pages/SprintsScreen.css'), 'utf8'),
    metrics: '.sprints-summary__metrics',
    metric: '.sprints-summary__metric'
  },
  {
    name: 'Marcos',
    css: readFileSync(resolve('src/features/schedule/pages/MilestonesScreen.css'), 'utf8'),
    metrics: '.milestones-summary__metrics',
    metric: '.milestones-summary__metric'
  },
  {
    name: 'Kanban',
    css: readFileSync(resolve('src/features/tasks/pages/KanbanScreen.css'), 'utf8'),
    metrics: '.kanban-summary__metrics',
    metric: '.kanban-summary__metric'
  }
];

function rule(css, selector) {
  const start = css.indexOf(`${selector} {`);
  expect(start, `Regra CSS ausente: ${selector}`).toBeGreaterThanOrEqual(0);
  const bodyStart = css.indexOf('{', start) + 1;
  return css.slice(bodyStart, css.indexOf('}', bodyStart));
}

describe('divisores responsivos dos resumos de Planning', () => {
  it.each(summaries)(
    '$name usa gap estrutural sem lógica posicional',
    ({ css, metrics, metric }) => {
      expect(rule(css, metrics)).toContain('gap: var(--border-width-default)');
      expect(rule(css, metrics)).toContain('background: var(--color-border-default)');
      expect(rule(css, metric)).toContain('background: var(--color-surface-primary)');
      expect(css).not.toMatch(new RegExp(`${metric.replace('.', '\\.')}[^,{]*:nth-child`));
    }
  );
});
