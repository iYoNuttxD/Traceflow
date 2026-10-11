import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function mediaBlock(css, condition) {
  const start = css.indexOf(`@media ${condition}`);
  if (start === -1) return null;
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    if (css[index] === '}') depth -= 1;
    if (depth === 0) return css.slice(open + 1, index);
  }
  return null;
}

describe('S2-02 correções do reteste — ponto do ☰ em alto contraste (S202-R08)', () => {
  it('CR-07 o AppShell.css desenha o ponto com cor do sistema quando forced-colors está ativo', () => {
    const css = readFileSync(resolve('src/app/layout/AppShell.css'), 'utf8');
    const block = mediaBlock(css, '(forced-colors: active)');
    const rule = block?.match(/\.trace-shell__menu-dot\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(block).not.toBeNull();
    expect(rule).toMatch(/forced-color-adjust:\s*none/);
    expect(rule).toMatch(/background(-color)?:\s*CanvasText/);
  });
});
