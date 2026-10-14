import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { parseStylesheet, ruleDeclarations } from '../helpers/css-rules.js';

const styles = (path) => parseStylesheet(readFileSync(resolve(`src/features/${path}`), 'utf8'));
const dashboard = styles('indicators/DashboardPanel.css');

it('anchors shared filter actions to the trailing footer with an accessible clear target', () => {
  const footer = styles('schedule/components/FilterActions.css');
  expect(ruleDeclarations(footer, '.filter-actions')).toMatchObject({
    display: 'flex',
    'justify-content': 'flex-end',
    'grid-column': '1 / -1'
  });
  expect(ruleDeclarations(footer, '.filter-actions__clear')).toMatchObject({
    'min-height': 'var(--size-touch-target)'
  });
});

it('keeps duration plots and actions in shared rows and Sprint dividers across all cells', () => {
  expect(
    ruleDeclarations(dashboard, '.dashboard-panel__duration-pair > .indicator-card')
  ).toMatchObject({ 'grid-template-rows': 'subgrid' });
  expect(
    ruleDeclarations(dashboard, '.dashboard-panel__duration-pair .indicator-card__visualization')
  ).toMatchObject({ 'grid-row': '3', 'align-content': 'stretch' });
  expect(
    ruleDeclarations(dashboard, '.dashboard-panel__duration-pair .dashboard-chart__data')
  ).toMatchObject({ 'margin-top': 'auto' });
  expect(
    ruleDeclarations(
      dashboard,
      '.dashboard-panel__section--sprintScope .dashboard-panel__detail-grid'
    )
  ).toMatchObject({ 'align-items': 'stretch' });
  expect(
    ruleDeclarations(dashboard, '.dashboard-panel__detail-grid .indicator-card')['border-right']
  ).toBe('var(--border-width-default) solid var(--color-border-default)');
  expect(ruleDeclarations(dashboard, '.indicator-card')['border-top']).toBe(
    'var(--border-width-default) solid var(--color-border-default)'
  );
  expect(ruleDeclarations(dashboard, '.indicator-card__table-scroll')['max-height']).toBe('20rem');
  expect(
    ruleDeclarations(
      dashboard,
      '.dashboard-panel__section--tests .dashboard-panel__detail-grid, .dashboard-panel__section--defects .dashboard-panel__detail-grid'
    )
  ).toMatchObject({ 'align-items': 'stretch' });
  expect(
    ruleDeclarations(dashboard, '.dashboard-panel__metric-grid > .indicator-card')
  ).toMatchObject({ 'grid-template-rows': 'subgrid' });
});

it('keeps inline status wrappable and analytics navigation compact without shrinking targets', () => {
  expect(ruleDeclarations(dashboard, '.indicator-card__title-status')).toMatchObject({
    display: 'flex',
    'flex-wrap': 'wrap'
  });
  expect(ruleDeclarations(dashboard, '.dashboard-panel__tabs .internal-tab')).toMatchObject({
    'padding-inline': 'var(--space-3)',
    'white-space': 'nowrap'
  });
});
