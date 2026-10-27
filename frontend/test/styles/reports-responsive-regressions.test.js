import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { conditionalRules, parseStylesheet, ruleDeclarations } from '../helpers/css-rules.js';

const css = parseStylesheet(
  readFileSync(resolve('src/features/reports/ReportsScreen.css'), 'utf8')
);

// Source contracts only: rendered width/overflow acceptance remains a browser check.
describe('Reports responsive ownership', () => {
  it('declares its own container and grid, independent of schedule page containers', () => {
    expect(ruleDeclarations(css, '.reports-screen.page-container')).toMatchObject({
      container: 'reports-page / inline-size'
    });
    expect(ruleDeclarations(css, '.reports-grid')).toMatchObject({
      display: 'grid',
      'grid-template-columns': 'repeat(3, minmax(min(100%, 18rem), 1fr))'
    });
    expect(ruleDeclarations(css, ".reports-grid > [role='listitem']")).toMatchObject({
      'min-width': '0px'
    });
  });

  it.each([
    ['min-width: 88rem', 'repeat(4, minmax(min(100%, 18rem), 1fr))'],
    ['max-width: 66rem', 'repeat(2, minmax(min(100%, 18rem), 1fr))'],
    ['max-width: 40rem', 'minmax(0, 1fr)']
  ])('adapts to available Reports width (%s)', (condition, columns) => {
    const rules = conditionalRules(css, 'container', `reports-page (${condition})`);
    expect(ruleDeclarations(rules, '.reports-grid')).toMatchObject({
      'grid-template-columns': columns
    });
  });

  it('keeps compact report and creation cards independent of milestone/sprint containers', () => {
    const compact = conditionalRules(css, 'container', 'reports-page (max-width: 40rem)');
    expect(ruleDeclarations(compact, '.reports-grid .report-card')).toMatchObject({
      'min-height': '0px'
    });
    expect(ruleDeclarations(compact, '.reports-grid .new-milestone-card')).toMatchObject({
      'min-height': '13rem'
    });
  });
});
