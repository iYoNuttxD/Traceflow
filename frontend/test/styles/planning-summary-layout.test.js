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
  it.each(summaries)('$name não usa lógica posicional nos divisores', ({ css, metric }) => {
    expect(css).not.toMatch(new RegExp(`${metric.replace('.', '\\.')}[^,{]*:nth-child`));
  });

  it('Sprints desenha divisores somente nas células reais, sem fundo de preenchimento', () => {
    const [{ css, metrics, metric }] = summaries;
    expect(rule(css, metrics)).not.toContain('gap: var(--border-width-default)');
    expect(rule(css, metrics)).toContain('background: var(--color-surface-primary)');
    expect(rule(css, metric)).toContain(
      'border-top: var(--border-width-default) solid var(--color-border-default)'
    );
    expect(rule(css, metric)).toContain(
      'border-right: var(--border-width-default) solid var(--color-border-default)'
    );
    expect(rule(css, metrics)).toContain('display: flex');
    expect(rule(css, metrics)).toContain('flex-wrap: wrap');
    expect(rule(css, metric)).toContain('flex: 1 1 0');
    expect(css).toMatch(
      /@container sprints-page \(max-width: 66rem\)[\s\S]*?flex: 1 1 calc\(100% \/ 3\)/
    );
    expect(css).toMatch(/@container sprints-page \(max-width: 40rem\)[\s\S]*?flex: 1 1 50%/);
    expect(css).toMatch(/@container sprints-page \(max-width: 24rem\)[\s\S]*?flex-basis: 100%/);
    expect(css).not.toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
  });
});

it('Kanban mantém a navegação dentro do gutter próprio, com scroll interno', () => {
  const [{ css }] = summaries.filter((summary) => summary.name === 'Kanban');
  const navigation = rule(css, '.kanban-screen .project-section-tabs');
  expect(navigation).toContain('margin-inline: 0');
  expect(navigation).toContain('max-width: 100%');
  const tabs = readFileSync(resolve('src/shared/styles/internal-tabs.css'), 'utf8');
  expect(rule(tabs, '.internal-tabs')).toContain('overflow-x: auto');
  const board = readFileSync(resolve('src/features/tasks/components/KanbanBoard.css'), 'utf8');
  expect(board).toContain('overflow-x: auto');
});
