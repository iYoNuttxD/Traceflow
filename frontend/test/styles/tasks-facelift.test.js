import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { conditionalRules, parseStylesheet, ruleDeclarations } from '../helpers/css-rules.js';

const screenSource = readFileSync(resolve('src/features/tasks/pages/TasksScreen.jsx'), 'utf8');
const screenCss = readFileSync(resolve('src/features/tasks/pages/TasksScreen.css'), 'utf8');
const listSource = readFileSync(resolve('src/features/tasks/components/TaskList.jsx'), 'utf8');
const listCss = readFileSync(resolve('src/features/tasks/components/TaskList.css'), 'utf8');

describe('Tasks facelift responsivo', () => {
  it('usa tokens semânticos e o mesmo markup em Light/Dark', () => {
    expect(`${screenCss}\n${listCss}`).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(screenSource).not.toMatch(/data-theme|prefers-color-scheme/);
  });

  it('mantém display grid na cascata base e declara colunas 3/2/1 por container', () => {
    const style = document.createElement('style');
    const grid = document.createElement('div');
    style.textContent = listCss;
    grid.className = 'tasks-list-grid';
    document.head.append(style);
    document.body.append(grid);
    try {
      // jsdom resolves the base cascade, but does not lay out containers or evaluate widths.
      expect(getComputedStyle(grid).display).toBe('grid');
      expect(getComputedStyle(grid).gridTemplateColumns).toBe(
        'repeat(3, minmax(min(100%, 18rem), 1fr))'
      );
    } finally {
      grid.remove();
      style.remove();
    }

    expect(
      ruleDeclarations(parseStylesheet(screenCss), '.tasks-screen.page-container')
    ).toMatchObject({
      'container-name': 'tasks-page',
      'container-type': 'inline-size'
    });
    // These are scoped declaration contracts, not browser proof of responsive geometry.
    const stylesheet = parseStylesheet(listCss);
    expect(
      ruleDeclarations(
        conditionalRules(stylesheet, 'container', 'tasks-page (max-width: 68rem)'),
        '.tasks-list-grid'
      )
    ).toMatchObject({ 'grid-template-columns': 'repeat(2, minmax(0, 1fr))' });
    expect(
      ruleDeclarations(
        conditionalRules(stylesheet, 'container', 'tasks-page (max-width: 34rem)'),
        '.tasks-list-grid'
      )
    ).toMatchObject({ 'grid-template-columns': 'minmax(0, 1fr)' });
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
    expect(listCss).toContain('.task-catalog-card:focus-visible');
    expect(listCss).toContain('min-height: calc(var(--size-touch-target)');
    expect(listCss).toMatch(/\.task-catalog-card__footer \{[\s\S]*?justify-content: flex-end;/);
    expect(listCss).not.toContain('.task-catalog-card__footer > span');
    expect(screenCss).toContain('.task-form-dialog .sprint-dialog__body');
  });
});
