import { describe, expect, it } from 'vitest';
import { presentDashboardPreference } from '../../src/modules/indicators/dashboard-preference.presenter.js';
import { defaultDashboardPreference } from '../../src/modules/indicators/personalized-dashboard.catalog.js';

const row = (widgets) => ({
  configurationVersion: 1,
  configuration: { widgets },
  updatedAt: new Date('2026-10-06T12:00:00Z')
});
describe('legacy preference presentation', () => {
  it('defaults old/missing preferences to unpinned, and exposes only a real boolean pin', () => {
    expect(presentDashboardPreference(null).pinnedToOverview).toBe(false);
    expect(presentDashboardPreference(row(['I01'])).pinnedToOverview).toBe(false);
    for (const value of [null, 'true', 1, {}]) {
      expect(
        presentDashboardPreference({
          ...row(['I01']),
          configuration: { widgets: ['I01'], pinnedToOverview: value }
        }).pinnedToOverview
      ).toBe(false);
    }
  });
  it('preserves a pin when removed widgets require a read-only fallback', () => {
    const saved = { ...row(['I99']), configuration: { widgets: ['I99'], pinnedToOverview: true } };
    const before = structuredClone(saved);
    expect(presentDashboardPreference(saved)).toMatchObject({
      widgets: defaultDashboardPreference().widgets,
      pinnedToOverview: true,
      configurationAdjusted: true
    });
    expect(saved).toEqual(before);
  });
  it('filters missing/unapproved IDs, preserves order, and never mutates the row', () => {
    const saved = row(['I03', 'I23', 'I99', 'I01']);
    const before = structuredClone(saved);
    expect(presentDashboardPreference(saved)).toMatchObject({
      widgets: ['I23', 'I01'],
      configurationAdjusted: true,
      isDefault: false
    });
    expect(saved).toEqual(before);
  });
  it.each([[['I03', 'I99']], [[]], [null], ['I01']])(
    'uses the canonical default for unusable widgets %j',
    (widgets) => {
      expect(presentDashboardPreference(row(widgets))).toMatchObject({
        widgets: defaultDashboardPreference().widgets,
        configurationAdjusted: true,
        isDefault: true
      });
    }
  );
  it('retains valid metadata without claiming an automatic version migration', () => {
    expect(presentDashboardPreference({ ...row(['I01']), configurationVersion: 7 })).toEqual({
      configurationVersion: 7,
      widgets: ['I01'],
      pinnedToOverview: false,
      isDefault: false,
      updatedAt: '2026-10-06T12:00:00.000Z'
    });
  });
  it('bounds duplicate and oversized legacy selections', () => {
    expect(presentDashboardPreference(row(['I01', 'I01'])).widgets).toEqual(['I01']);
    expect(
      presentDashboardPreference(
        row([
          'I01',
          'I02',
          'I04',
          'I06',
          'I09',
          'I10',
          'I11',
          'I12',
          'I13',
          'I14',
          'I15',
          'I16',
          'I17'
        ])
      ).widgets
    ).toHaveLength(12);
  });
});
