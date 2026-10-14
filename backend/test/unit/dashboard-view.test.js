import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_VIEWS,
  dashboardFilterPolicy,
  publicDashboardViews,
  publicDashboardCatalog
} from '../../src/modules/indicators/dashboard-view.catalog.js';
import { deriveDashboardViewState } from '../../src/modules/indicators/dashboard.service.js';
import { INDICATORS } from '../../src/modules/indicators/indicators.catalog.js';

describe('P7 dashboard composition and filter contract', () => {
  it('mantém IDs estáveis, conhecidos e sem duplicatas em cada view', () => {
    expect(Object.keys(DASHBOARD_VIEWS)).toEqual([
      'GENERAL',
      'PLANNING',
      'GITHUB',
      'FLOW',
      'SPRINT',
      'TASK',
      'QUALITY',
      'TRACEABILITY'
    ]);
    for (const sections of Object.values(DASHBOARD_VIEWS)) {
      const ids = sections.flatMap((section) => section.metricIds);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.every((id) => INDICATORS[id])).toBe(true);
      expect(ids).not.toContain('I68');
    }
    expect(DASHBOARD_VIEWS.GENERAL.flatMap((section) => section.metricIds)).toHaveLength(8);
    expect(DASHBOARD_VIEWS.GENERAL.find((section) => section.id === 'sprint').metricIds).toEqual([
      'I45',
      'I46'
    ]);
  });

  it('deriva compatibilidade de filtros do catálogo executável e marca lacunas seguras', () => {
    expect(dashboardFilterPolicy('I22', 'period')).toBe('SUPPORTED');
    expect(dashboardFilterPolicy('I23', 'period')).toBe('NOT_APPLICABLE');
    expect(dashboardFilterPolicy('I23', 'sprint')).toBe('UNSAFE');
    expect(dashboardFilterPolicy('I45', 'sprint')).toBe('SUPPORTED');
    expect(dashboardFilterPolicy('I47', 'sprint')).toBe('NOT_APPLICABLE');
    expect(dashboardFilterPolicy('I02', 'responsible')).toBe('UNSAFE');
    expect(dashboardFilterPolicy('I03', 'sprint')).toBe('UNSAFE');
  });

  it('P8.4 publica compatibilidade da visão incluindo o período do Health', () => {
    const views = publicDashboardViews();
    expect(views.find((item) => item.view === 'GENERAL')).toMatchObject({
      periodIncludesProjectHealth: true,
      filterCompatibility: { period: 'SUPPORTED', sprint: 'SUPPORTED', responsible: 'UNSAFE' }
    });
    expect(views.find((item) => item.view === 'SPRINT').filterCompatibility.period).toBe(
      'NOT_APPLICABLE'
    );
    expect(views.find((item) => item.view === 'TRACEABILITY').filterCompatibility.period).toBe(
      'UNSAFE'
    );
    expect(views.every((item) => item.filterCompatibility.responsible !== 'SUPPORTED')).toBe(true);
  });

  it('publica metadata para P9 sem transformar I68 em widget', () => {
    const catalog = publicDashboardCatalog();
    expect(catalog).toHaveLength(Object.keys(INDICATORS).length);
    expect(catalog.find((item) => item.metricId === 'I03').views).toEqual([]);
    expect(catalog.find((item) => item.metricId === 'I45')).toMatchObject({
      definitionVersion: 2,
      visualizations: ['LINE'],
      supportedFilters: ['sprintId']
    });
    for (const [metricId, source, unit, eventClock, supportedFilters, visualizations] of [
      ['I01', 'Tasks', 'PERCENT', null, [], ['PROGRESS', 'KPI']],
      ['I02', 'Tasks e commits GitHub', 'COMMITS', 'Commit.date', ['period'], ['TABLE', 'BAR']],
      ['I04', 'GitHub', 'PERCENT', 'PullRequestLifecycleEvent.occurredAt', ['period'], ['KPI']],
      ['I20', 'Tasks e movimentos', 'DAYS', 'TaskMovement.movedAt', ['period'], ['KPI']],
      ['I36', 'Sprint e histórico', 'HOURS', null, ['sprintId'], ['KPI']],
      [
        'I48',
        'Testes e Defects',
        'EXECUTIONS',
        'TestExecution.executedAt',
        ['period'],
        ['STACKED_BAR', 'TABLE']
      ],
      ['I61', 'Rastreabilidade', 'PERCENT', null, [], ['KPI']]
    ])
      expect(catalog.find((item) => item.metricId === metricId)).toMatchObject({
        source,
        unit,
        eventClock,
        supportedFilters,
        visualizations,
        definitionVersion: 1
      });
    expect(catalog.some((item) => item.metricId === 'I68')).toBe(false);
    expect(catalog.every((item) => item.visualizations.length > 0)).toBe(true);
  });

  it('preserva estados individuais e só deriva o estado da view', () => {
    const metrics = Object.freeze([
      Object.freeze({ state: 'STALE', value: 2 }),
      Object.freeze({ state: 'AVAILABLE', value: 1 })
    ]);
    expect(deriveDashboardViewState(metrics)).toBe('PARTIAL');
    expect(metrics).toEqual([
      { state: 'STALE', value: 2 },
      { state: 'AVAILABLE', value: 1 }
    ]);
    expect(deriveDashboardViewState([{ state: 'AVAILABLE', value: 2 }])).toBe('AVAILABLE');
    expect(deriveDashboardViewState([{ state: 'AVAILABLE', value: 0 }])).toBe('NO_DATA');
    expect(deriveDashboardViewState([{ state: 'NO_DATA', value: null }])).toBe('NO_DATA');
    expect(deriveDashboardViewState([{ state: 'UNAVAILABLE', value: null }])).toBe('UNAVAILABLE');
    expect(
      deriveDashboardViewState([
        { state: 'STALE', value: 2 },
        { state: 'AVAILABLE', value: 1 }
      ])
    ).toBe('PARTIAL');
  });
});
