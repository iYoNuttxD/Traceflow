import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { conditionalRules, parseStylesheet, ruleDeclarations } from '../helpers/css-rules.js';

const styles = (path) => parseStylesheet(readFileSync(resolve(`src/${path}`), 'utf8'));
const tokens = ruleDeclarations(styles('styles/tokens.css'), ':root');
const shell = styles('app/layout/AppShell.css');
const workspaceWidth = 'min(var(--layout-page-max), calc(100% - (2 * var(--layout-page-gutter))))';

const workspaces = [
  ['projects/pages/ProjectDetailsScreen', '.project-details-screen'],
  ['projects/pages/ProjectsScreen', '.projects-screen'],
  ['indicators/IndicatorsScreen', '.indicators-screen'],
  ['tasks/pages/TasksScreen', '.tasks-screen'],
  ['tasks/pages/KanbanScreen', '.kanban-screen'],
  ['requirements/pages/RequirementsScreen', '.requirements-screen'],
  ['schedule/pages/SprintsScreen', '.sprints-screen'],
  ['schedule/pages/MilestonesScreen', '.milestones-screen'],
  ['schedule/pages/ScheduleScreen', '.schedule-screen']
];

describe('responsive workspace width ownership', () => {
  it('lets data-heavy pages grow beyond laptop widths without nested width caps', () => {
    expect(tokens).toMatchObject({
      '--layout-page-max': '120rem',
      '--layout-page-gutter': 'var(--space-8)',
      '--layout-sidebar-expanded': '17rem',
      '--layout-sidebar-collapsed': '5.5rem'
    });
    const content = ruleDeclarations(shell, '.trace-shell__content');
    expect(content).toMatchObject({ width: '100%', 'min-width': '0px' });
    expect(content).not.toHaveProperty('max-width');
    expect(ruleDeclarations(shell, '.trace-shell')).toMatchObject({
      'grid-template-columns': 'var(--layout-sidebar-expanded) minmax(0, 1fr)'
    });
    expect(ruleDeclarations(shell, ".trace-shell[data-sidebar-state='collapsed']")).toMatchObject({
      'grid-template-columns': 'var(--layout-sidebar-collapsed) minmax(0, 1fr)'
    });
  });

  it.each(workspaces)('%s owns one gutter pair and the shared workspace cap', (path, selector) => {
    expect(
      ruleDeclarations(styles(`features/${path}.css`), `${selector}.page-container`)
    ).toMatchObject({
      width: workspaceWidth
    });
  });

  it('preserves deliberate reading and settings form limits on large monitors', () => {
    expect(tokens).toMatchObject({
      '--layout-reading-max': '73.75rem',
      '--layout-settings-max': '82.5rem'
    });
    expect(ruleDeclarations(styles('styles/global.css'), '.page-container')).toMatchObject({
      width: 'min(var(--layout-reading-max), calc(100% - 2rem))'
    });
    const settings = styles('features/settings/SettingsLayout.css');
    expect(ruleDeclarations(settings, '.settings-shell')).toMatchObject({
      width: 'min(var(--layout-settings-max), calc(100% - (2 * var(--layout-page-gutter))))'
    });
    expect(ruleDeclarations(settings, '.settings-content')).toMatchObject({
      width: '100%',
      'max-width': '55rem',
      'min-width': '0px'
    });
    expect(
      ruleDeclarations(
        styles('features/projects/styles/project-admin.css'),
        '.project-admin-screen.page-container'
      )
    ).toMatchObject({ width: 'min(58rem, calc(100% - (2 * var(--layout-page-gutter))))' });
    expect(ruleDeclarations(styles('styles/global.css'), '.page-header p')).toMatchObject({
      'max-width': '720px'
    });
  });

  it('retains mobile drawer sizing and compact gutters rather than scaling down desktop', () => {
    const mobile = conditionalRules(shell, 'media', '(max-width: 720px)');
    expect(
      ruleDeclarations(mobile, ".trace-shell, .trace-shell[data-sidebar-state='collapsed']")
    ).toMatchObject({
      display: 'block'
    });
    expect(ruleDeclarations(mobile, '.trace-shell__content')).toMatchObject({
      'max-width': '100%'
    });
    expect(
      ruleDeclarations(
        conditionalRules(
          styles('features/indicators/IndicatorsScreen.css'),
          'media',
          '(max-width: 720px)'
        ),
        '.indicators-screen.page-container'
      )
    ).toMatchObject({ width: 'calc(100% - (2 * var(--space-4)))' });
    expect(
      ruleDeclarations(
        conditionalRules(
          styles('features/projects/pages/ProjectDetailsScreen.css'),
          'media',
          '(max-width: 720px)'
        ),
        '.project-details-screen.page-container'
      )
    ).toMatchObject({ width: 'min(100% - (2 * var(--space-4)), 40rem)' });
  });

  it.each([
    ['projects/pages/ProjectsScreen', 'projects-page', '.projects-grid', '85rem', '17.5rem'],
    [
      'requirements/pages/RequirementsScreen',
      'requirements-page',
      '.requirements-grid',
      '88rem',
      '18rem'
    ],
    ['schedule/pages/SprintsScreen', 'sprints-page', '.sprint-grid', '88rem', '18rem'],
    ['schedule/pages/MilestonesScreen', 'milestones-page', '.milestone-grid', '88rem', '19rem']
  ])(
    'adds usable catalog columns based on the %s container, not screen size',
    (path, container, selector, threshold, minimum) => {
      expect(
        ruleDeclarations(
          conditionalRules(
            styles(`features/${path}.css`),
            'container',
            `${container} (min-width: ${threshold})`
          ),
          selector
        )
      ).toMatchObject({ 'grid-template-columns': `repeat(4, minmax(min(100%, ${minimum}), 1fr))` });
    }
  );
  it('wraps pinned panel actions and bounds explanatory text without narrowing charts', () => {
    const dashboard = styles('features/indicators/DashboardPanel.css');
    expect(ruleDeclarations(dashboard, '.dashboard-panel__overview-heading p')).toMatchObject({
      'max-width': '72ch'
    });
    expect(
      ruleDeclarations(dashboard, '.dashboard-panel--overview .dashboard-panel__toolbar-actions')
    ).toMatchObject({ 'flex-wrap': 'wrap' });
    expect(
      ruleDeclarations(
        styles('features/indicators/components/PersonalizedDashboard.css'),
        '.dashboard-editor__footer .dialog-actions'
      )
    ).toMatchObject({ 'flex-wrap': 'wrap' });
    expect(ruleDeclarations(dashboard, '.dashboard-panel__body')).not.toHaveProperty('max-width');
  });
});
