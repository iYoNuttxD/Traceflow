import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const screenSource = readFileSync(resolve('src/features/tasks/pages/TasksScreen.jsx'), 'utf8');
const screenCss = readFileSync(resolve('src/features/tasks/pages/TasksScreen.css'), 'utf8');
const listSource = readFileSync(resolve('src/features/tasks/components/TaskList.jsx'), 'utf8');
const listCss = readFileSync(resolve('src/features/tasks/components/TaskList.css'), 'utf8');

describe('Tasks facelift responsivo', () => {
  it('usa tokens semânticos e o mesmo markup em Light/Dark', () => {
    expect(`${screenCss}\n${listCss}`).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(screenSource).not.toMatch(/data-theme|prefers-color-scheme/);
  });

  it('mantém grid 3/2/1 guiado pelo container da página', () => {
    expect(screenCss).toContain('container-name: tasks-page');
    expect(listCss).toMatch(
      /\.tasks-list-grid \{[\s\S]*?grid-template-columns: repeat\(3,[\s\S]*?@container tasks-page \(max-width: 68rem\)[\s\S]*?repeat\(2,/
    );
    expect(listCss).toMatch(
      /@container tasks-page \(max-width: 34rem\)[\s\S]*?\.tasks-list-grid \{\s*grid-template-columns: minmax\(0, 1fr\)/
    );
  });

  it('usa progressive disclosure, card compacto e Details canônico', () => {
    expect(screenSource).toContain('<CollapsibleFilterPanel');
    expect(screenSource).toContain('<SprintDialog');
    expect(screenSource).toContain('<TaskDetailsPanel');
    expect(listSource).toContain('className="new-task-card"');
    expect(listSource).toContain('<SprintActionsMenu');
    expect(listSource).not.toContain('Ver detalhes');
    expect(listSource).not.toContain('Rastreabilidade');
    expect(listSource).not.toContain('onUnlinkCommit');
    expect(listCss).toMatch(/\.task-catalog-card__description \{[\s\S]*?-webkit-line-clamp: 2;/);
    expect(listCss).not.toMatch(/\.task-catalog-card \{[\s\S]*?height:\s*\d+px/);
  });

  it('preserva foco, alvos mínimos, dialog rolável e remove o retorno legado', () => {
    expect(screenSource).not.toContain('← Voltar para o projeto');
    expect(screenCss).toContain('min-height: var(--size-touch-target)');
    expect(listCss).toContain('.task-catalog-card__open:focus-visible');
    expect(listCss).toContain('min-height: calc(var(--size-touch-target)');
    expect(listCss).toMatch(/\.task-catalog-card__footer \{[\s\S]*?justify-content: flex-end;/);
    expect(listCss).not.toContain('.task-catalog-card__footer > span');
    expect(screenCss).toContain('.task-form-dialog .sprint-dialog__body');
  });
});
