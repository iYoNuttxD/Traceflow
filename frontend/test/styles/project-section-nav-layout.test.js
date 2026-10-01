import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseStylesheet, ruleDeclarations } from '../helpers/css-rules.js';

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
