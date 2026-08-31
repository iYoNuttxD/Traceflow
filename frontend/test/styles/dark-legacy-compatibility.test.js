import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const globalCss = readFileSync(resolve('src/styles/global.css'), 'utf8');
const tokensCss = readFileSync(resolve('src/styles/tokens.css'), 'utf8');
const kanbanCss = readFileSync(resolve('src/features/tasks/pages/KanbanScreen.css'), 'utf8');
const settingsCss = readFileSync(resolve('src/features/settings/SettingsLayout.css'), 'utf8');
const settingsLayout = readFileSync(resolve('src/features/settings/SettingsLayout.jsx'), 'utf8');
const internalTabsCss = readFileSync(resolve('src/shared/styles/internal-tabs.css'), 'utf8');
const settingsSharedCss = readFileSync(
  resolve('src/features/settings/styles/settings-shared.css'),
  'utf8'
);
const securitySettingsCss = readFileSync(
  resolve('src/features/settings/SecuritySettingsPage.css'),
  'utf8'
);
const integrationsSettingsCss = readFileSync(
  resolve('src/features/settings/IntegrationsSettingsPage.css'),
  'utf8'
);
const authShellCss = readFileSync(resolve('src/features/auth/components/AuthShell.css'), 'utf8');
const authLoginCss = readFileSync(resolve('src/features/auth/pages/LoginScreen.css'), 'utf8');
const publicPageShellCss = readFileSync(
  resolve('src/shared/components/PublicPageShell.css'),
  'utf8'
);
const statusSurfaceCss = readFileSync(resolve('src/shared/components/StatusSurface.css'), 'utf8');

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
    expect(rule(settingsCss, '.settings-header .eyebrow')).toContain(
      'color: var(--color-accent-primary)'
    );
    expect(settingsLayout).toContain("import '../../shared/styles/internal-tabs.css'");
    expect(rule(internalTabsCss, '.internal-tab')).toContain('color: var(--color-text-secondary)');
    expect(rule(internalTabsCss, '.internal-tab--active')).toContain(
      'color: var(--color-accent-text)'
    );
    expect(rule(internalTabsCss, '.internal-tab--active::after')).toContain(
      'background: var(--color-accent-primary)'
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

  it('usa surfaces C2 temáticas em Settings sem manter cards brancos legados', () => {
    expect(rule(settingsSharedCss, '.settings-surface')).toContain(
      'background: var(--color-surface-primary)'
    );
    expect(rule(settingsSharedCss, '.settings-surface')).toContain(
      'color: var(--color-text-primary)'
    );
    expect(rule(securitySettingsCss.split('@media')[0], '.session-row')).toContain(
      'background: var(--color-surface-secondary)'
    );
    expect(rule(securitySettingsCss, '.session-copy small')).toContain(
      'color: var(--color-text-secondary)'
    );
    expect(rule(integrationsSettingsCss, '.integration-box')).toContain(
      'background: var(--color-surface-secondary)'
    );
    expect(settingsSharedCss).not.toContain('background: #fff');
    expect(settingsSharedCss).not.toContain('--color-text-on-light');
  });

  it('mantém controles C2 e a row OAuth compacta sem reduzir o touch target', () => {
    expect(
      rule(
        settingsSharedCss,
        '.settings-actions .button,\n.settings-surface button,\n.settings-surface .button,\n.settings-sensitive-dialog .button'
      )
    ).toContain('min-height: var(--size-touch-target)');
    const compactRow = rule(integrationsSettingsCss.split('@media')[0], '.integration-box-compact');
    expect(compactRow).toContain('display: flex');
    expect(compactRow).toContain('padding-block: var(--space-2)');
  });

  it('mantém as surfaces Focused de Auth temáticas e sem paleta local fixa', () => {
    expect(authShellCss).toContain('background: var(--color-surface-primary)');
    expect(publicPageShellCss).toContain('background: var(--color-bg-page)');
    expect(statusSurfaceCss).toContain('background: var(--color-surface-primary)');
    expect(rule(authLoginCss, '.github-login-button')).toContain(
      'background: var(--color-provider-surface)'
    );
  });

  it('mantém o link de recuperação com touch target completo', () => {
    expect(rule(authLoginCss, '.auth-recovery-link')).toContain('display: inline-flex');
    expect(rule(authLoginCss, '.auth-recovery-link')).toContain(
      'min-height: var(--size-touch-target)'
    );
    expect(rule(authLoginCss, '.auth-recovery-link')).toContain('align-items: center');
  });

  it('mantém a action de provider acima de 4.5:1 nos dois temas', () => {
    const themes = [rule(tokensCss, ':root'), rule(tokensCss, "[data-theme='dark']")];

    for (const theme of themes) {
      expect(
        contrastRatio(
          token(theme, '--color-provider-text'),
          token(theme, '--color-provider-surface')
        )
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('mantém os tokens on-light invariantes e legíveis sobre branco', () => {
    const rootTheme = rule(tokensCss, ':root');
    const darkTheme = rule(tokensCss, "[data-theme='dark']");

    for (const textToken of ['--color-text-on-light-primary', '--color-text-on-light-secondary']) {
      expect(darkTheme).not.toContain(`${textToken}:`);
      expect(contrastRatio(token(rootTheme, textToken), '#ffffff')).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('preserva as cores explícitas das danger zones de Settings', () => {
    expect(rule(settingsSharedCss, '.settings-danger-section')).toContain(
      'var(--color-danger-surface)'
    );
    expect(
      rule(
        settingsSharedCss,
        '.settings-danger-section .settings-section-heading h2,\n.settings-danger-section .settings-section-heading h3'
      )
    ).toContain('color: var(--color-danger-text)');
    expect(rule(settingsSharedCss, '.danger-impact')).toContain('color: var(--color-danger-text)');
  });
});
