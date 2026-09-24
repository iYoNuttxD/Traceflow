import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve('src/features/projects/styles/project-tabs.css'), 'utf8');

describe('ProjectSectionNav shared layout', () => {
  it('stacks a nested project navigation below the title block', () => {
    expect(css).toMatch(
      /\.page-header:has\(> \.project-section-tabs\)\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s
    );
    expect(css).toMatch(
      /\.page-header > \.project-section-tabs\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*100%;/s
    );
  });

  it('keeps overflow inside the navigation without layout offsets', () => {
    expect(css).toMatch(
      /\.project-section-tabs\s*\{[^}]*overflow-x:\s*auto;[^}]*overflow-y:\s*hidden;/s
    );
    expect(css).not.toMatch(/margin-(?:inline|left|right):\s*calc\([^;]*-1\)/);
    expect(css).not.toMatch(/position:\s*absolute/);
  });
});
