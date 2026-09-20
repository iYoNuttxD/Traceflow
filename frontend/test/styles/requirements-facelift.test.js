import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve('src/features/requirements/pages/RequirementsScreen.css'), 'utf8');
const source = readFileSync(
  resolve('src/features/requirements/pages/RequirementsScreen.jsx'),
  'utf8'
);
const detailsSource = readFileSync(
  resolve('src/features/requirements/components/RequirementDetails.jsx'),
  'utf8'
);

describe('Requirements facelift responsivo', () => {
  it('usa tokens semânticos e o mesmo markup para Light/Dark', () => {
    expect(css).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(source).not.toMatch(/data-theme|prefers-color-scheme/);
  });

  it('mantém grid 3/2/1 guiado pela largura real do container', () => {
    expect(css).toContain('container-name: requirements-page');
    expect(css).toMatch(
      /\.requirements-grid \{[\s\S]*?grid-template-columns: repeat\(3,[\s\S]*?@container requirements-page \(max-width: 68rem\)[\s\S]*?\.requirements-grid \{\s*grid-template-columns: repeat\(2,/
    );
    expect(css).toMatch(
      /@container requirements-page \(max-width: 34rem\)[\s\S]*?\.requirements-grid,[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/
    );
    expect(css).toMatch(
      /@container requirements-page \(max-width: 34rem\)[\s\S]*?\.requirements-overview dl \{\s*grid-template-columns: repeat\(2,/
    );
  });

  it('usa progressive disclosure e mantém analytics detalhado fora do card', () => {
    expect(source).toContain('<CollapsibleFilterPanel');
    expect(css).toMatch(
      /\.requirements-filters \{[\s\S]*?border: var\(--border-width-default\) solid var\(--color-border-default\);[\s\S]*?border-radius: var\(--radius-lg\);[\s\S]*?background: var\(--color-surface-primary\);/
    );
    expect(css).toContain('.requirements-filters .planning-filter-panel__toggle:focus-visible');
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
    expect(css).toMatch(/\.requirement-catalog-card__description \{[\s\S]*?-webkit-line-clamp: 2;/);
    expect(css).not.toMatch(/\.requirement-catalog-card \{[\s\S]*?height:\s*\d+px/);
  });

  it('preserva alvos mínimos, foco visível e scroll interno dos dialogs', () => {
    expect(css).toContain('min-height: var(--size-touch-target)');
    expect(css).toContain('.requirement-catalog-card:focus-visible');
    expect(css).toMatch(/\.sprint-dialog__body \{[\s\S]*?overflow-y: auto/);
    expect(css).toMatch(
      /\.requirement-information-grid \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/
    );
    expect(css).toMatch(
      /@media \(max-width: 720px\)[\s\S]*?\.requirement-details-dialog \.sprint-dialog__header \{\s*flex-wrap: wrap;[\s\S]*?\.requirement-details-dialog \.sprint-dialog__controls \{\s*width: 100%;/
    );
  });

  it('usa relation boxes canônicas em uma coluna para Tasks e 2/1 para Qualidade', () => {
    expect(detailsSource).toContain('<TaskTraceabilityGrid title="Tarefas vinculadas"');
    expect(detailsSource).toContain('<ArtifactCategory label="Tarefas"');
    expect(detailsSource).toContain('<TaskTraceabilityGrid title="Qualidade"');
    expect(detailsSource).toContain('label="Casos de teste"');
    expect(detailsSource).toContain('label="Defeitos"');
    expect(css).toMatch(
      /\.requirement-task-relations \.task-detail-traceability-grid \{\s*grid-template-columns: minmax\(0, 1fr\);/
    );
    expect(css).toMatch(
      /@media \(max-width: 860px\)[\s\S]*?\.requirement-quality-relations \.task-detail-traceability-grid \{\s*grid-template-columns: minmax\(0, 1fr\);/
    );
  });
});
