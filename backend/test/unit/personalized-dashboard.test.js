import { describe, expect, it } from 'vitest';
import { publicDashboardCatalog } from '../../src/modules/indicators/dashboard-view.catalog.js';
import {
  defaultDashboardPreference,
  isCustomizable
} from '../../src/modules/indicators/personalized-dashboard.catalog.js';
import {
  dashboardPreferenceBodySchema,
  dashboardQuerySchema
} from '../../src/modules/indicators/indicators.validation.js';

describe('P9 catalog authority', () => {
  it('uses one valid, immutable default for first read and reset', () => {
    const first = defaultDashboardPreference();
    expect(first.widgets.length).toBeGreaterThan(0);
    expect(
      dashboardPreferenceBodySchema.safeParse({
        configurationVersion: first.configurationVersion,
        widgets: first.widgets
      }).success
    ).toBe(true);
    first.widgets.reverse();
    expect(defaultDashboardPreference().widgets).not.toEqual(first.widgets);
  });
  it('approves stable standalone presenters independently of Health role', () => {
    const catalog = publicDashboardCatalog();
    for (const id of ['I02', 'I22', 'I47'])
      expect(catalog.find((i) => i.metricId === id)).toMatchObject({
        healthRole: 'CONTEXT_ONLY',
        customization: { customizable: true }
      });
    for (const id of ['I03', 'I05', 'I07', 'I08', 'I19', 'I68', 'I69', 'I70', 'HEALTH'])
      expect(isCustomizable(id)).toBe(false);
    for (const item of catalog.filter((i) => i.customization.customizable)) {
      expect(item.customization.description).not.toMatch(
        /RF\d+|metricId|reasonCode|definitionVersion|Task\.[A-Za-z]|Sprint\.[A-Za-z]|CONCLUIDO/
      );
      expect(['compact', 'standard', 'wide', 'full']).toContain(item.customization.sizeClass);
      expect(item.customization.defaultVisualization).toBeTruthy();
      expect(
        dashboardQuerySchema.safeParse({ view: 'CUSTOM', widgets: item.metricId }).success
      ).toBe(true);
    }
  });
});
