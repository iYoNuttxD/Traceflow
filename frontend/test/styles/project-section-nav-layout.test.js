import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { conditionalRules, parseStylesheet, ruleDeclarations } from '../helpers/css-rules.js';

const css = readFileSync(resolve('src/features/projects/styles/project-tabs.css'), 'utf8');
const stylesheet = parseStylesheet(css);

describe('ProjectSectionNav shared layout', () => {
  it('stacks a nested project navigation below the title block', () => {
    expect(ruleDeclarations(stylesheet, '.page-header:has(> .project-section-tabs)')).toMatchObject(
      {
        display: 'grid',
        'grid-template-columns': 'minmax(0, 1fr)'
      }
    );
    expect(ruleDeclarations(stylesheet, '.page-header > .project-section-tabs')).toMatchObject({
      width: '100%',
      'max-width': '100%'
    });
  });

  it('keeps overflow inside the navigation without layout offsets', () => {
    expect(ruleDeclarations(stylesheet, '.project-section-tabs')).toMatchObject({
      'overflow-x': 'auto',
      'overflow-y': 'hidden'
    });
    expect(css).not.toMatch(/margin-(?:inline|left|right):\s*calc\([^;]*-1\)/);
    expect(css).not.toMatch(/position:\s*absolute/);
  });
});

// Browser geometry at 1280/1440 provides actual fit evidence; this guards its CSS policy.
it('compacts the desktop navigation while preserving the inherited 48px target', () => {
  const desktop = conditionalRules(stylesheet, 'media', '(min-width: 1280px)');
  expect(ruleDeclarations(desktop, '.project-section-tabs')).toMatchObject({
    gap: '0px',
    'justify-content': 'space-between'
  });
  expect(ruleDeclarations(desktop, '.project-section-tabs .internal-tab')).toMatchObject({
    'padding-inline': 'var(--space-1)',
    'font-size': 'var(--font-size-1)'
  });
  const shared = parseStylesheet(
    readFileSync(resolve('src/shared/styles/internal-tabs.css'), 'utf8')
  );
  expect(ruleDeclarations(shared, '.internal-tab')['min-height']).toBe('3rem');
});
