import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const controlsCss = readFileSync(resolve('src/shared/styles/traceability-controls.css'), 'utf8');
const tokensCss = readFileSync(resolve('src/styles/tokens.css'), 'utf8');

describe('tokens dos controles compartilhados de rastreabilidade', () => {
  it('não reintroduz cores semânticas literais no stylesheet compartilhado', () => {
    expect(controlsCss).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });

  it('usa foundations de border e radius em vez dos literals legados', () => {
    expect(controlsCss).not.toMatch(/\bborder:\s*1px\b/i);
    expect(controlsCss).not.toMatch(/\bborder-radius:\s*(?:9|10|12|999)px\b/i);
  });

  it('referencia somente tokens existentes na fonte executável', () => {
    const tokenReferences = new Set(
      [...controlsCss.matchAll(/var\((--[a-z0-9-]+)\)/gi)].map((match) => match[1])
    );

    expect(tokenReferences.size).toBeGreaterThan(0);
    for (const tokenName of tokenReferences) {
      expect(tokensCss, `Token ausente: ${tokenName}`).toContain(`${tokenName}:`);
    }
  });
});
