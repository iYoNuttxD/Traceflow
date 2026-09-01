import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const html = readFileSync(resolve('index.html'), 'utf8');
const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];

function runBootstrap({ storedTheme = null, systemDark = false, matchMedia = true } = {}) {
  const root = { dataset: {} };
  const localStorage = { getItem: vi.fn().mockReturnValue(storedTheme) };
  const bootstrapWindow = {
    localStorage,
    ...(matchMedia
      ? {
          matchMedia: vi.fn().mockReturnValue({ matches: systemDark })
        }
      : {})
  };

  Function('window', 'document', bootstrap)(bootstrapWindow, { documentElement: root });
  return { root, localStorage, bootstrapWindow };
}

describe('bootstrap anti-FOUC de tema', () => {
  it.each([
    ['light', true, 'light'],
    ['dark', false, 'dark'],
    ['system', true, 'dark'],
    ['system', false, 'light'],
    [null, true, 'dark'],
    ['banana', false, 'light']
  ])('resolve storage %s e sistema %s como %s', (storedTheme, systemDark, expected) => {
    expect(runBootstrap({ storedTheme, systemDark }).root.dataset.theme).toBe(expected);
  });

  it('usa fallback Light quando matchMedia não está disponível', () => {
    expect(runBootstrap({ storedTheme: 'system', matchMedia: false }).root.dataset.theme).toBe(
      'light'
    );
  });
});
