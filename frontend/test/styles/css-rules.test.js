import { describe, expect, it } from 'vitest';
import { conditionalRules, parseStylesheet, ruleDeclarations } from '../helpers/css-rules.js';

describe('scoped CSS assertions', () => {
  it('reads declarations regardless of their order', () => {
    const first = parseStylesheet('.tabs { display: grid; overflow-x: auto; }');
    const reordered = parseStylesheet('.tabs { overflow-x: auto; display: grid; }');

    expect(ruleDeclarations(first, '.tabs')).toEqual(ruleDeclarations(reordered, '.tabs'));
  });

  it('does not borrow declarations from a sibling or nested rule when the target is empty', () => {
    const sheet = parseStylesheet(`
      .filters {}
      .sibling { border-radius: 12px; }
      @container page (max-width: 34rem) {
        .filters { border-radius: 8px; }
      }
    `);

    expect(ruleDeclarations(sheet, '.filters')).toEqual({});
    expect(
      ruleDeclarations(conditionalRules(sheet, 'container', 'page (max-width: 34rem)'), '.filters')
    ).toEqual({ 'border-radius': '8px' });
    expect(() => ruleDeclarations(sheet, '.missing')).toThrow('found 0');
  });

  it('keeps media and container rules separate and resolves grouped selectors exactly', () => {
    const sheet = parseStylesheet(`
      @media (max-width: 720px) { .first, .second { width: 100%; } }
      @container page (max-width: 34rem) { .first, .second { width: 50%; } }
    `);

    expect(
      ruleDeclarations(conditionalRules(sheet, 'media', '(max-width: 720px)'), '.first, .second')
    ).toEqual({ width: '100%' });
    expect(
      ruleDeclarations(
        conditionalRules(sheet, 'container', 'page (max-width: 34rem)'),
        '.first,\n .second'
      )
    ).toEqual({ width: '50%' });
  });
});
