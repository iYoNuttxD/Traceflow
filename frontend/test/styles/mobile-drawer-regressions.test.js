import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { conditionalRules, parseStylesheet, ruleDeclarations } from '../helpers/css-rules.js';

const source = readFileSync(resolve('src/app/layout/AppShell.css'), 'utf8');
const shell = parseStylesheet(source);
const mobile = conditionalRules(shell, 'media', '(max-width: 720px)');

describe('mobile drawer viewport contract (not rendered layout evidence)', () => {
  it('bounds the drawer by dynamic viewport height with a legacy fallback', () => {
    expect(ruleDeclarations(mobile, '.trace-shell__sidebar')).toMatchObject({
      position: 'fixed',
      height: '100dvh',
      'box-sizing': 'border-box',
      overflow: 'hidden'
    });
    expect(source).toMatch(/height: 100vh;\s*height: 100dvh;/);
    // JSDOM drops env() declarations; verify these source contracts separately.
    expect(source).toMatch(/padding-top: env\(safe-area-inset-top, 0px\);/);
  });

  it('keeps the profile in a shrinkable scroll region with safe-area spacing', () => {
    expect(ruleDeclarations(shell, '.trace-shell__sidebar-content')).toMatchObject({
      'min-height': '0px',
      flex: '1 1 0%',
      'overflow-y': 'auto'
    });
    expect(ruleDeclarations(mobile, '.trace-shell__sidebar-content')).toMatchObject({
      'overscroll-behavior-y': 'contain'
    });
    expect(source).toMatch(
      /padding-bottom: calc\(var\(--space-5\) \+ env\(safe-area-inset-bottom, 0px\)\);/
    );
    expect(ruleDeclarations(mobile, '.trace-shell__sidebar-header')).toMatchObject({
      'flex-shrink': '0'
    });
  });
});
