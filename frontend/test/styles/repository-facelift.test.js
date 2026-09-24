import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve('src/features/github/pages/RepositoryInfoScreen.jsx'), 'utf8');
const css = readFileSync(resolve('src/features/github/pages/RepositoryInfoScreen.css'), 'utf8');
const externalActionCss = readFileSync(
  resolve('src/shared/components/GithubExternalAction.css'),
  'utf8'
);

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
    expect(css).toMatch(/\.repository-table-scroll \{[\s\S]*?overflow-x: auto;/);
    expect(css).toMatch(/\.repository-table \{[\s\S]*?min-width: 64rem;/);
    expect(css).not.toMatch(/\.repository-table thead \{[\s\S]*?display: none/);
  });

  it('usa tokens e o mesmo markup em Light e Dark', () => {
    expect(css).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(source).not.toMatch(/data-theme|prefers-color-scheme/);
    expect(css).toContain('container-name: repository-page');
    expect(css).toContain('@container repository-page (max-width: 36rem)');
  });

  it('limita títulos e preserva foco visível nos controles de overflow e filtros', () => {
    expect(css).toMatch(/\.repository-artifact-title \{[\s\S]*?-webkit-line-clamp: 2;/);
    expect(css).toContain('.repository-table-scroll:focus-visible');
    expect(css).toContain('.repository-filters .planning-filter-panel__toggle:focus-visible');
    expect(source).toContain('title={artifact.title || undefined}');
  });

  it('mantém a ação externa compacta, delimitada e baseada em tokens', () => {
    expect(externalActionCss).toContain('.button.task-detail-external-link');
    expect(externalActionCss).toContain('min-height: var(--size-touch-target)');
    expect(externalActionCss).toContain(
      'border: var(--border-width-default) solid var(--color-border-strong)'
    );
    expect(externalActionCss).toContain('border-radius: var(--radius-sm)');
    expect(externalActionCss).toContain('background: var(--color-surface-primary)');
    expect(externalActionCss).toContain('text-decoration: none');
  });
});
