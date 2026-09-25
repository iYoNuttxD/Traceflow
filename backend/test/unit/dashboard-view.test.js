import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_VIEWS,
  dashboardFilterPolicy,
  publicDashboardCatalog
} from '../../src/modules/indicators/dashboard-view.catalog.js';
import { deriveDashboardViewState } from '../../src/modules/indicators/dashboard.service.js';
import { INDICATORS } from '../../src/modules/indicators/indicators.catalog.js';

describe('P7 dashboard composition and filter contract', () => {
  it('mantém IDs estáveis, conhecidos e sem duplicatas em cada view', () => {
    expect(Object.keys(DASHBOARD_VIEWS)).toEqual([
      'GENERAL',
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
    expect(DASHBOARD_VIEWS.GENERAL.flatMap((section) => section.metricIds)).toHaveLength(7);
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

  it('publica metadata para P9 sem transformar I68 em widget', () => {
    const catalog = publicDashboardCatalog();
    expect(catalog).toHaveLength(Object.keys(INDICATORS).length);
    expect(catalog.find((item) => item.metricId === 'I03').views).toEqual([]);
    expect(catalog.find((item) => item.metricId === 'I45')).toMatchObject({
      definitionVersion: 2,
      visualizations: ['LINE'],
      supportedFilters: ['sprintId']
    });
    expect(catalog.some((item) => item.metricId === 'I68')).toBe(false);
    expect(catalog.every((item) => item.visualizations.length > 0)).toBe(true);
  });

  it('preserva estados individuais e só deriva o estado da view', () => {
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
