import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { conditionalRules, parseStylesheet, ruleDeclarations } from '../helpers/css-rules.js';

const integrationsCss = readFileSync(
  resolve('src/features/settings/IntegrationsSettingsPage.css'),
  'utf8'
);
const securityCss = readFileSync(resolve('src/features/settings/SecuritySettingsPage.css'), 'utf8');
const securitySource = readFileSync(
  resolve('src/features/settings/SecuritySettingsPage.jsx'),
  'utf8'
);
const confirmDialogCss = readFileSync(resolve('src/shared/components/ConfirmDialog.css'), 'utf8');
const settingsSharedCss = readFileSync(
  resolve('src/features/settings/styles/settings-shared.css'),
  'utf8'
);

describe('regressões responsivas de dialogs e formulários de Settings', () => {
  it('remove o flex-basis vertical apenas das ações do dialog sensível mobile', () => {
    expect(
      ruleDeclarations(
        conditionalRules(parseStylesheet(integrationsCss), 'media', '(max-width: 560px)'),
        '.settings-sensitive-dialog .dialog-actions .button'
      )
    ).toMatchObject({ flex: '0 0 auto', width: '100%' });
    expect(
      ruleDeclarations(
        conditionalRules(parseStylesheet(confirmDialogCss), 'media', '(max-width: 560px)'),
        '.dialog-actions .button'
      )
    ).toMatchObject({ flex: '1 1 8rem' });
    const sheet = parseStylesheet(settingsSharedCss);
    const buttons = Array.from(sheet.cssRules).find((rule) =>
      rule.selectorText?.split(',').some((s) => s.trim() === '.settings-sensitive-dialog .button')
    );
    expect(buttons?.style.getPropertyValue('min-height')).toBe('var(--size-touch-target)');
  });

  it('reorganiza os campos de Security pela largura real da surface', () => {
    expect(securitySource).toContain('settings-surface security-settings-surface');
    const sheet = parseStylesheet(securityCss);
    expect(ruleDeclarations(sheet, '.security-settings-surface')).toMatchObject({
      'container-type': 'inline-size',
      'container-name': 'security-settings'
    });
    const narrow = conditionalRules(sheet, 'container', 'security-settings (max-width: 34rem)');
    expect(
      ruleDeclarations(narrow, '.security-settings-surface .settings-field-grid')
    ).toMatchObject({ 'grid-template-columns': '1fr' });
    expect(
      ruleDeclarations(narrow, '.security-settings-surface .settings-field-full')
    ).toMatchObject({ 'grid-column': 'auto' });
  });
});
