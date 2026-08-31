import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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

describe('regressões responsivas de Settings E5.1.1', () => {
  it('remove o flex-basis vertical apenas das ações do dialog sensível mobile', () => {
    expect(integrationsCss).toMatch(
      /@media \(max-width: 560px\)[\s\S]*\.settings-sensitive-dialog \.dialog-actions \.button \{[\s\S]*flex: 0 0 auto;[\s\S]*width: 100%;/
    );
    expect(confirmDialogCss).toMatch(
      /@media \(max-width: 560px\)[\s\S]*\.dialog-actions \.button \{\s*flex: 1 1 8rem;/
    );
    expect(settingsSharedCss).toMatch(
      /\.settings-sensitive-dialog \.button[\s\S]*min-height: var\(--size-touch-target\);/
    );
  });

  it('reorganiza os campos de Security pela largura real da surface', () => {
    expect(securitySource).toContain('settings-surface security-settings-surface');
    expect(securityCss).toMatch(
      /\.security-settings-surface \{\s*container-type: inline-size;\s*container-name: security-settings;/
    );
    expect(securityCss).toMatch(
      /@container security-settings \(max-width: 34rem\)[\s\S]*\.security-settings-surface \.settings-field-grid \{\s*grid-template-columns: 1fr;/
    );
    expect(securityCss).toMatch(
      /@container security-settings \(max-width: 34rem\)[\s\S]*\.security-settings-surface \.settings-field-full \{\s*grid-column: auto;/
    );
  });
});
