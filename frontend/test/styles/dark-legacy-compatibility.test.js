import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const globalCss = readFileSync(resolve('src/styles/global.css'), 'utf8');
const tokensCss = readFileSync(resolve('src/styles/tokens.css'), 'utf8');
const kanbanCss = readFileSync(resolve('src/features/tasks/pages/KanbanScreen.css'), 'utf8');
const settingsCss = readFileSync(resolve('src/features/settings/SettingsLayout.css'), 'utf8');

function rule(css, selector) {
  const start = css.lastIndexOf(`${selector} {`);
  expect(start, `Regra CSS ausente: ${selector}`).toBeGreaterThanOrEqual(0);

  const bodyStart = css.indexOf('{', start) + 1;
  const bodyEnd = css.indexOf('}', bodyStart);
  return css.slice(bodyStart, bodyEnd);
}

function token(theme, name) {
  const match = theme.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i'));
  expect(match, `Token CSS ausente ou não resolvido: ${name}`).not.toBeNull();
  return match[1];
}

function relativeLuminance(hexColor) {
  const channels = hexColor
    .slice(1)
    .match(/.{2}/g)
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first, second) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

describe('compatibilidade de conteúdo legado com os temas', () => {
  it('usa tokens semânticos nos títulos e textos introdutórios transversais', () => {
    expect(rule(globalCss, '.page-header h1')).toContain('color: var(--color-text-strong)');
    expect(rule(globalCss, '.page-header p')).toContain('color: var(--color-text-secondary)');
    expect(rule(globalCss, '.page-header .eyebrow')).toContain(
      'color: var(--color-accent-primary)'
    );
  });

  it('mantém navegação e estados de página expostos ao shell legíveis por tema', () => {
    expect(rule(globalCss, '.back-link')).toContain('color: var(--color-accent-primary)');
    expect(rule(globalCss, '.page-container > .empty-state')).toContain(
      'color: var(--color-text-secondary)'
    );
    expect(rule(kanbanCss, '.kanban-members-empty')).toContain(
      'color: var(--color-text-secondary)'
    );
  });

  it('preserva a navegação de Settings no mesmo sistema semântico', () => {
    expect(rule(settingsCss, '.settings-shell > header .eyebrow')).toContain(
      'color: var(--color-accent-primary)'
    );
    expect(rule(settingsCss, '.settings-nav a')).toContain('color: var(--color-text-secondary)');
    expect(rule(settingsCss, '.settings-nav a:hover,\n.settings-nav a.active')).toContain(
      'color: var(--color-accent-text)'
    );
    expect(rule(settingsCss, '.settings-nav a:hover,\n.settings-nav a.active')).toContain(
      'background: var(--color-accent-surface)'
    );
  });

  it('mantém os tokens textuais expostos acima de 4.5:1 nos dois temas', () => {
    const themes = [rule(tokensCss, ':root'), rule(tokensCss, "[data-theme='dark']")];

    for (const theme of themes) {
      const pageBackground = token(theme, '--color-bg-page');

      for (const textToken of [
        '--color-text-strong',
        '--color-text-secondary',
        '--color-accent-primary'
      ]) {
        expect(contrastRatio(token(theme, textToken), pageBackground)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
