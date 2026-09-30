import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseStylesheet, ruleDeclarations } from '../helpers/css-rules.js';

const source = readFileSync(resolve('src/features/github/pages/RepositoryInfoScreen.jsx'), 'utf8');
const css = readFileSync(resolve('src/features/github/pages/RepositoryInfoScreen.css'), 'utf8');
const externalActionCss = readFileSync(
  resolve('src/shared/components/GithubExternalAction.css'),
  'utf8'
);

const stylesheet = parseStylesheet(css);
const externalStylesheet = parseStylesheet(externalActionCss);

describe('Repository C2 facelift', () => {
  it('usa as primitives canônicas sem expandir o contrato funcional', () => {
    expect(source).toContain('<CollapsibleFilterPanel');
    expect(source).toContain('<SelectControl');
    expect(source).toContain('<GithubExternalAction');
    expect(source).toMatch(/<\/header>\s*<ProjectSectionNav/);
    expect(css).not.toMatch(/\.repository-header\s*\{[^}]*display:/);
    expect(source).not.toContain('<select');
    expect(source).not.toContain('Aplicar filtros');
    expect(source).not.toContain('Voltar para o projeto');
    expect(source).not.toContain('Ver rastreabilidade');
    expect(source).not.toMatch(/placeholder=.*(SHA|título|autor)/i);
  });

  it('mantém uma tabela real em surface com scroll horizontal contido', () => {
    expect(source).toContain('<table className="repository-table">');
    expect(source).toContain('className="repository-table-scroll"');
    expect(ruleDeclarations(stylesheet, '.repository-table-scroll')).toMatchObject({
      'overflow-x': 'auto',
      'max-width': '100%',
      'overscroll-behavior-inline': 'contain'
    });
    expect(ruleDeclarations(stylesheet, '.repository-table')).toMatchObject({
      'min-width': '64rem'
    });
    expect(css).not.toMatch(/\.repository-table thead \{[\s\S]*?display: none/);
  });

  it('usa tokens e o mesmo markup em Light e Dark', () => {
    expect(css).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(source).not.toMatch(/data-theme|prefers-color-scheme/);
    expect(css).toContain('container-name: repository-page');
    expect(css).toContain('@container repository-page (max-width: 36rem)');
  });

  it('limita títulos e preserva foco visível nos controles de overflow e filtros', () => {
    expect(ruleDeclarations(stylesheet, '.repository-artifact-title')).toMatchObject({
      '-webkit-line-clamp': '2',
      overflow: 'hidden'
    });
    for (const selector of [
      '.repository-table-scroll:focus-visible',
      '.repository-filters .planning-filter-panel__toggle:focus-visible'
    ]) {
      expect(ruleDeclarations(stylesheet, selector)).toMatchObject({
        outline: 'var(--focus-ring-width) solid var(--color-focus-ring)'
      });
    }
    expect(source).toContain('title={artifact.title || undefined}');
  });

  it('mantém a ação externa compacta, delimitada e baseada em tokens', () => {
    expect(ruleDeclarations(externalStylesheet, '.button.task-detail-external-link')).toMatchObject(
      {
        'min-height': 'var(--size-touch-target)',
        border: 'var(--border-width-default) solid var(--color-border-strong)',
        'border-radius': 'var(--radius-sm)',
        background: 'var(--color-surface-primary)',
        'text-decoration': 'none'
      }
    );
  });
});
