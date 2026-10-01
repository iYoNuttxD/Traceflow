import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { conditionalRules, parseStylesheet, ruleDeclarations } from '../helpers/css-rules.js';
import {
  literalColorDeclarations,
  themeSpecificRules,
  unscopedSprintSelectors
} from '../helpers/style-architecture.js';

const css = readFileSync(resolve('src/features/requirements/pages/RequirementsScreen.css'), 'utf8');
const dialogCss = readFileSync(
  resolve('src/features/schedule/components/SprintDialog.css'),
  'utf8'
);
const source = readFileSync(
  resolve('src/features/requirements/pages/RequirementsScreen.jsx'),
  'utf8'
);
const detailsSource = readFileSync(
  resolve('src/features/requirements/components/RequirementDetails.jsx'),
  'utf8'
);
const stylesheet = parseStylesheet(css);
const dialogStylesheet = parseStylesheet(dialogCss);

describe('Requirements facelift responsivo', () => {
  it('usa tokens semânticos e o mesmo markup para Light/Dark', () => {
    expect(css).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(literalColorDeclarations(stylesheet)).toEqual([]);
    expect(source).not.toMatch(/data-theme|prefers-color-scheme/);
    expect(themeSpecificRules(stylesheet)).toEqual([]);
  });

  it('mantém grid 3/2/1 guiado pela largura real do container', () => {
    expect(ruleDeclarations(stylesheet, '.requirements-screen.page-container')).toMatchObject({
      'container-name': 'requirements-page',
      'container-type': 'inline-size'
    });
    expect(ruleDeclarations(stylesheet, '.requirements-grid')).toMatchObject({
      'grid-template-columns': 'repeat(3, minmax(min(100%, 18rem), 1fr))'
    });
    const medium = conditionalRules(
      stylesheet,
      'container',
      'requirements-page (max-width: 68rem)'
    );
    expect(ruleDeclarations(medium, '.requirements-grid')).toMatchObject({
      'grid-template-columns': 'repeat(2, minmax(0, 1fr))'
    });
    const narrow = conditionalRules(
      stylesheet,
      'container',
      'requirements-page (max-width: 34rem)'
    );
    expect(
      ruleDeclarations(
        narrow,
        '.requirements-grid, .requirements-filter-grid, .requirement-form, .requirement-information-grid'
      )
    ).toMatchObject({ 'grid-template-columns': 'minmax(0, 1fr)' });
    expect(ruleDeclarations(narrow, '.requirements-overview dl')).toMatchObject({
      'grid-template-columns': 'repeat(2, minmax(0, 1fr))'
    });
  });

  it('usa progressive disclosure e mantém analytics detalhado fora do card', () => {
    expect(source).toContain('<CollapsibleFilterPanel');
    expect(ruleDeclarations(stylesheet, '.requirements-filters')).toMatchObject({
      border: 'var(--border-width-default) solid var(--color-border-default)',
      'border-radius': 'var(--radius-lg)',
      background: 'var(--color-surface-primary)'
    });
    expect(
      ruleDeclarations(
        stylesheet,
        '.requirements-filters .planning-filter-panel__toggle:focus-visible'
      )
    ).toMatchObject({
      outline: 'var(--focus-ring-width) solid var(--color-focus-ring)',
      'outline-offset': 'var(--focus-ring-offset)'
    });
    expect(source).toContain('className="new-requirement-card"');
    expect(source).not.toContain('requirement-card-metrics');
    expect(source).not.toContain('Progresso de implementação');
  });

  it('remove navegação redundante e usa ações direcionadas no card e no Details', () => {
    expect(source).not.toContain('← Voltar para o projeto');
    expect(source).not.toContain('Ver detalhes');
    expect(detailsSource).toContain('button button-danger button-compact');
    expect(detailsSource).not.toContain('SprintActionsMenu');
    expect(detailsSource).not.toContain('RequirementHistory');
  });

  it('limita descrição a duas linhas sem altura fixa no card', () => {
    expect(ruleDeclarations(stylesheet, '.requirement-catalog-card__description')).toMatchObject({
      display: '-webkit-box',
      '-webkit-box-orient': 'vertical',
      '-webkit-line-clamp': '2',
      overflow: 'hidden'
    });
    expect(ruleDeclarations(stylesheet, '.requirement-catalog-card').height ?? '').not.toMatch(
      /\d+px/
    );
  });

  it('preserva alvos mínimos, foco visível e scroll interno dos dialogs', () => {
    expect(
      ruleDeclarations(stylesheet, '.requirement-catalog-card__actions .button')
    ).toMatchObject({
      'min-height': 'var(--size-touch-target)'
    });
    expect(ruleDeclarations(stylesheet, '.requirement-catalog-card:focus-visible')).toMatchObject({
      outline: 'var(--focus-ring-width) solid var(--color-focus-ring)',
      'outline-offset': 'var(--focus-ring-offset)'
    });
    expect(ruleDeclarations(dialogStylesheet, '.sprint-dialog__body')).toMatchObject({
      'overflow-y': 'auto'
    });
    expect(ruleDeclarations(stylesheet, '.requirement-information-grid')).toMatchObject({
      'grid-template-columns': 'repeat(2, minmax(0, 1fr))'
    });
    const mobile = conditionalRules(stylesheet, 'media', '(max-width: 720px)');
    expect(
      ruleDeclarations(mobile, '.requirement-details-dialog .sprint-dialog__header')
    ).toMatchObject({
      'flex-wrap': 'wrap'
    });
    expect(
      ruleDeclarations(mobile, '.requirement-details-dialog .sprint-dialog__controls')
    ).toMatchObject({
      width: '100%'
    });
  });

  it('mantém o layout-base do SprintDialog fora do CSS de Requirements', () => {
    expect(css).not.toMatch(/(?:^|\n)\.sprint-dialog(?:-backdrop|__body)?\s*\{/);
    expect(css).not.toMatch(/(?:^|\n)\.sprint-menu(?:-item)?\s*\{/);
    expect(dialogCss).toContain('.sprint-dialog-backdrop {');
    expect(unscopedSprintSelectors(stylesheet)).toEqual([]);
    expect(ruleDeclarations(dialogStylesheet, '.sprint-dialog-backdrop')).toMatchObject({
      position: 'fixed',
      'z-index': 'var(--z-modal)'
    });
    expect(ruleDeclarations(dialogStylesheet, '.sprint-dialog')).toMatchObject({
      display: 'flex',
      'flex-direction': 'column',
      overflow: 'hidden'
    });
    expect(ruleDeclarations(dialogStylesheet, '.sprint-dialog__body')).toMatchObject({
      'min-height': '0px',
      'overflow-y': 'auto'
    });
    for (const rule of [
      '  .sprint-dialog__header { display: grid; }',
      '@media (max-width: 720px) { .sprint-dialog__body { overflow: hidden; } }',
      '.requirement-details-dialog .sprint-dialog__body, .sprint-dialog__body { padding: 0; }',
      '.other-feature .sprint-menu-trigger { display: none; }',
      '.requirements-screen + .sprint-dialog { display: none; }',
      '.requirement-details-dialog  ~ .sprint-menu { display: none; }',
      ':is(.requirement-details-dialog, .other-feature) .sprint-dialog { display: grid; }'
    ]) {
      expect(unscopedSprintSelectors(parseStylesheet(rule)), rule).not.toEqual([]);
    }
  });

  it('usa relation boxes canônicas em uma coluna para Tasks e 2/1 para Qualidade', () => {
    expect(detailsSource).toContain('<TaskTraceabilityGrid title="Tarefas vinculadas"');
    expect(detailsSource).toContain('<ArtifactCategory label="Tarefas"');
    expect(detailsSource).toContain('<TaskTraceabilityGrid title="Qualidade"');
    expect(detailsSource).toContain('label="Casos de teste"');
    expect(detailsSource).toContain('label="Defeitos"');
    expect(
      ruleDeclarations(stylesheet, '.requirement-task-relations .task-detail-traceability-grid')
    ).toMatchObject({
      'grid-template-columns': 'minmax(0, 1fr)'
    });
    expect(
      ruleDeclarations(
        conditionalRules(stylesheet, 'media', '(max-width: 860px)'),
        '.requirement-quality-relations .task-detail-traceability-grid'
      )
    ).toMatchObject({ 'grid-template-columns': 'minmax(0, 1fr)' });
  });
});
