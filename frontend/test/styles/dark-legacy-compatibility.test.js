import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const globalCss = readFileSync(resolve('src/styles/global.css'), 'utf8');
const tokensCss = readFileSync(resolve('src/styles/tokens.css'), 'utf8');
const kanbanCss = readFileSync(resolve('src/features/tasks/pages/KanbanScreen.css'), 'utf8');
const kanbanBoardCss = readFileSync(
  resolve('src/features/tasks/components/KanbanBoard.css'),
  'utf8'
);
const movementHistoryCss = readFileSync(
  resolve('src/features/tasks/components/MovementHistory.css'),
  'utf8'
);
const taskDetailsCss = readFileSync(
  resolve('src/features/tasks/components/TaskDetailsPanel.css'),
  'utf8'
);
const taskCommentsCss = readFileSync(
  resolve('src/features/tasks/components/TaskComments.css'),
  'utf8'
);
const taskListCss = readFileSync(resolve('src/features/tasks/components/TaskList.css'), 'utf8');
const taskCardsCss = readFileSync(resolve('src/features/tasks/styles/task-cards.css'), 'utf8');
const requirementsCss = readFileSync(
  resolve('src/features/requirements/pages/RequirementsScreen.css'),
  'utf8'
);
const traceabilityCss = readFileSync(
  resolve('src/features/traceability/pages/TraceabilityScreen.css'),
  'utf8'
);
const traceabilityFlowCss = readFileSync(
  resolve('src/features/traceability/components/TraceabilityFlow.css'),
  'utf8'
);
const repositoryCss = readFileSync(
  resolve('src/features/github/pages/RepositoryInfoScreen.css'),
  'utf8'
);
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

function tokenMap(theme) {
  return Object.fromEntries(
    [...theme.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()])
  );
}

function resolvedToken(theme, name) {
  const rootTokens = tokenMap(rule(tokensCss, ':root'));
  const themeTokens =
    theme === 'dark'
      ? { ...rootTokens, ...tokenMap(rule(tokensCss, "[data-theme='dark']")) }
      : rootTokens;
  let value = themeTokens[name];
  const visited = new Set();

  while (value?.startsWith('var(')) {
    expect(visited.has(value), `Ciclo de tokens ao resolver ${name}`).toBe(false);
    visited.add(value);
    value = themeTokens[value.slice(4, -1).trim()];
  }

  expect(value, `Token CSS não resolvido: ${name} (${theme})`).toMatch(/^#[0-9a-f]{6}$/i);
  return value;
}

function property(cssRule, name) {
  const match = cssRule.match(new RegExp(`${name}:\\s*([^;]+);`));
  expect(match, `Propriedade CSS ausente: ${name}`).not.toBeNull();
  return match[1].trim();
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

  it('torna forms, métricas e erros globais temáticos na origem', () => {
    const controls = rule(globalCss, '.field input,\n.field textarea,\n.field select');
    expect(rule(globalCss, '.field span')).toContain('color: var(--color-text-primary)');
    expect(controls).toContain('color: var(--color-text-primary)');
    expect(controls).toContain('background: var(--color-bg-input)');
    expect(controls).toContain('border: 1px solid var(--color-border-default)');
    expect(rule(globalCss, '.field-error')).toContain('color: var(--color-danger-text)');
    expect(rule(globalCss, '.metric-value')).toContain('color: var(--color-accent-text)');
    expect(rule(globalCss, '.metric-description')).toContain('color: var(--color-text-secondary)');
  });

  it('cobre os panels que causaram o finding HIGH sem alterar seu layout', () => {
    expect(rule(taskListCss, '.task-item')).toContain('background: var(--color-surface-secondary)');
    expect(rule(kanbanBoardCss, '.kanban-column')).toContain(
      'background: var(--color-surface-secondary)'
    );
    expect(rule(kanbanBoardCss, '.kanban-task')).toContain(
      'background: var(--color-surface-primary)'
    );
    expect(rule(movementHistoryCss, '.kanban-history')).toContain(
      'background: var(--color-surface-primary)'
    );
    expect(
      rule(requirementsCss, '.requirement-item,\n.requirement-detail-panel,\n.linked-task-item')
    ).toContain('background: var(--color-surface-secondary)');
    expect(rule(traceabilityCss, '.traceability-table-wrapper')).toContain(
      'background: var(--color-surface-primary)'
    );
    expect(rule(repositoryCss, '.repository-table-wrapper')).toContain(
      'background: var(--color-surface-primary)'
    );
  });

  it('mantém foreground e background dos principais pares acima de 4.5:1', () => {
    const pairs = [
      ['--color-text-primary', '--color-bg-input'],
      ['--color-text-primary', '--color-surface-secondary'],
      ['--color-text-secondary', '--color-surface-secondary'],
      ['--color-text-strong', '--color-surface-primary'],
      ['--color-accent-text', '--color-surface-primary'],
      ['--color-danger-text', '--color-surface-primary'],
      ['--color-success-text', '--color-success-surface'],
      ['--color-warning-text', '--color-warning-surface'],
      ['--color-neutral-text', '--color-neutral-surface']
    ];

    for (const theme of ['light', 'dark']) {
      for (const [foreground, background] of pairs) {
        expect(
          contrastRatio(resolvedToken(theme, foreground), resolvedToken(theme, background)),
          `${foreground} sobre ${background} em ${theme}`
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('preserva o canvas categórico como light island com pares explícitos legíveis', () => {
    expect(rule(traceabilityFlowCss.split('@media')[0], '.traceability-flow-canvas')).toContain(
      'color: var(--color-text-on-light-primary)'
    );
    expect(rule(traceabilityFlowCss, '.trace-node strong')).toContain(
      'color: var(--color-text-on-light-primary)'
    );
    expect(rule(traceabilityFlowCss, '.trace-node span,\n.trace-node-detail dt')).toContain(
      'color: var(--color-text-on-light-secondary)'
    );

    const categoricalPairs = [
      ['.trace-node-requirement', '.trace-node-requirement span,\n.trace-node-requirement p'],
      ['.trace-node-task', '.trace-node-task span,\n.trace-node-task p'],
      ['.trace-node-issue', '.trace-node-issue span,\n.trace-node-issue p'],
      ['.trace-node-pull-request', '.trace-node-pull-request span,\n.trace-node-pull-request p'],
      ['.trace-node-commit', '.trace-node-commit span,\n.trace-node-commit p']
    ];

    for (const [surfaceSelector, textSelector] of categoricalPairs) {
      expect(
        contrastRatio(
          property(rule(traceabilityFlowCss, textSelector), 'color'),
          property(rule(traceabilityFlowCss, surfaceSelector), 'background')
        )
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('usa a camada semântica de modal acima da navegação', () => {
    expect(rule(taskDetailsCss, '.task-detail-overlay')).toContain('z-index: var(--z-modal)');
    expect(rule(taskDetailsCss, '.task-detail-overlay')).toContain(
      'background: var(--color-overlay)'
    );
    expect(rule(taskDetailsCss.split('@media')[0], '.task-detail-modal')).toContain(
      'background: var(--color-surface-elevated)'
    );
    const foundations = rule(tokensCss, ':root');
    const navigationLayer = Number(foundations.match(/--z-navigation:\s*(\d+)/)?.[1]);
    const modalLayer = Number(foundations.match(/--z-modal:\s*(\d+)/)?.[1]);
    expect(modalLayer).toBeGreaterThan(navigationLayer);
  });

  it('mantém comentários no owner da feature, temáticos e com touch targets completos', () => {
    expect(globalCss).not.toContain('.task-comments');
    expect(rule(taskCommentsCss, '.task-comments')).toContain(
      'background: var(--color-surface-secondary)'
    );
    expect(rule(taskCommentsCss, '.task-chat-bubble-own')).toContain(
      'background: var(--color-accent-surface)'
    );
    expect(rule(taskCommentsCss, '.task-chat-icon-button')).toContain(
      'width: var(--size-touch-target)'
    );
    expect(rule(taskCommentsCss, '.task-chat-icon-button')).toContain(
      'height: var(--size-touch-target)'
    );
  });

  it('não reintroduz literais de tema nos owners neutros auditados', () => {
    const semanticOwners = [
      globalCss,
      taskListCss,
      taskCardsCss,
      kanbanBoardCss,
      movementHistoryCss,
      taskDetailsCss,
      taskCommentsCss,
      kanbanCss,
      requirementsCss,
      traceabilityCss,
      repositoryCss
    ];

    for (const css of semanticOwners) {
      expect(css).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(/i);
    }
  });
});
