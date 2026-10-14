import { describe, expect, it } from 'vitest';
import { publicDashboardCatalog } from '../../src/modules/indicators/dashboard-view.catalog.js';
import {
  HEALTH_DIMENSIONS,
  HEALTH_REGISTRY
} from '../../src/modules/indicators/health/health.registry.js';
import {
  assessSignal,
  buildProjectHealth,
  healthStatus,
  healthWindow
} from '../../src/modules/indicators/health/health.policy.js';
import { INDICATORS } from '../../src/modules/indicators/indicators.catalog.js';

const row = (metricId, value, extras = {}) => ({ metricId, value, state: 'AVAILABLE', ...extras });
const map = (...rows) => new Map(rows.map((item) => [item.metricId, item]));
const signal = (metricId, current, previous) => assessSignal(metricId, current, previous);

describe('Project Health Model v1', () => {
  it('classifica todos os IDs canônicos e publica metadata sem transformar propostas em widgets', () => {
    const ids = Array.from({ length: 74 }, (_, index) => `I${String(index + 1).padStart(2, '0')}`);
    expect(Object.keys(HEALTH_REGISTRY)).toEqual(ids);
    expect(Object.keys(INDICATORS).filter((id) => !HEALTH_REGISTRY[id])).toEqual([]);
    expect(HEALTH_REGISTRY.I19.healthRole).toBe('UNIMPLEMENTED');
    expect(HEALTH_REGISTRY.I68.healthRole).toBe('NOT_RECOMMENDED');
    expect(['I02', 'I03', 'I05'].map((id) => HEALTH_REGISTRY[id].healthRole)).toEqual([
      'CONTEXT_ONLY',
      'CONTEXT_ONLY',
      'CONTEXT_ONLY'
    ]);
    expect(['I50', 'I51'].map((id) => HEALTH_REGISTRY[id].healthRole)).toEqual([
      'REDUNDANT',
      'REDUNDANT'
    ]);
    expect(publicDashboardCatalog().find((item) => item.metricId === 'I49')).toMatchObject({
      healthRole: 'SCORING_SIGNAL',
      healthDimension: 'QUALITY',
      healthModelVersion: 1
    });
    expect(
      Object.values(HEALTH_DIMENSIONS).reduce((sum, dimension) => sum + dimension.weight, 0)
    ).toBe(100);
    for (const dimension of Object.values(HEALTH_DIMENSIONS))
      expect(Object.values(dimension.signals).reduce((sum, weight) => sum + weight, 0)).toBe(100);
  });

  it('pontua planejamento, fluxo e esforço apenas com bases elegíveis', () => {
    const tasks = map(row('I26', 15), row('I28', 3), row('I29', 0), row('I30', 3));
    expect(['I28', 'I29', 'I30'].map((id) => signal(id, tasks).score)).toEqual([80, 100, 80]);
    expect(signal('I28', map(row('I26', 0), row('I28', 0))).status).toBe('UNASSESSED');
    const baseline = map(row('I20', 4, { eligibleCount: 3 }), row('I21', 6, { eligibleCount: 3 }));
    expect(signal('I20', map(row('I20', 6, { eligibleCount: 3 })), baseline).score).toBe(50);
    expect(signal('I20', map(row('I20', 6, { eligibleCount: 3 })), baseline).basis).toMatchObject({
      regressionPercent: 50,
      currentSample: 3,
      previousSample: 3
    });
    expect(signal('I21', map(row('I21', 4, { eligibleCount: 3 })), baseline).score).toBe(100);
    expect(signal('I20', map(row('I20', 6, { eligibleCount: 2 })), baseline).status).toBe(
      'UNASSESSED'
    );
    expect(
      signal(
        'I44',
        map(
          row('I44', { estimatedHours: 20, actualHours: 24 }, { components: { incomplete: false } })
        )
      ).score
    ).toBe(80);
    expect(
      signal('I44', map(row('I44', { estimatedHours: 20, actualHours: 24 }, { state: 'PARTIAL' })))
        .score
    ).toBeNull();
  });

  it('pontua burndown e mudança de escopo sem inventar base', () => {
    const down = row('I45', null, {
      points: [
        { remaining: 20, ideal: 20 },
        { remaining: 12, ideal: 8 }
      ],
      coverage: { totalPoints: 20 }
    });
    expect(signal('I45', map(down)).score).toBe(80);
    expect(signal('I45', map({ ...down, points: [down.points[0]] })).score).toBeNull();
    expect(
      signal('I71', map(row('I39', 10), row('I71', { addedCount: 1, removedCount: 1 }))).score
    ).toBe(80);
  });

  it('usa qualidade e lacunas por estágio, sem duplicar fail e blocked', () => {
    const current = map(
      row('I01', 80),
      row('I04', 10),
      row('I49', 70),
      row('I52', { PASS: 6, FAIL: 2, BLOCKED: 1, NEVER_EXECUTED: 1, total: 10 }),
      row('I58', 80),
      row('I64', 25),
      row('I61', 100),
      row('I62', 50),
      row('I63', 55),
      row('I65', 20),
      row('I66', 70),
      row('I50', 20),
      row('I51', 10)
    );
    expect(['I04', 'I49', 'I52', 'I58', 'I64'].map((id) => signal(id, current).score)).toEqual([
      90, 70, 60, 80, 75
    ]);
    expect(['I61', 'I62', 'I63', 'I65', 'I66'].map((id) => signal(id, current).score)).toEqual([
      100, 70, 85, 50, 90
    ]);
    expect(signal('I50', current).status).toBe('NEUTRAL');
    expect(signal('I66', map(row('I01', 30), row('I66', 35))).score).toBe(100);
  });

  it('distingue fila de PR vazia de idade desconhecida e exige baseline válido', () => {
    expect(signal('I73', map(row('I10', 0), row('I73', null, { state: 'NO_DATA' })))).toMatchObject(
      { score: 100, reasonCode: 'NO_OPEN_PRS' }
    );
    const current = map(row('I10', 2), row('I15', 50, { eligibleCount: 3 }), row('I73', 75 / 24));
    expect(signal('I73', current).score).toBe(50);
    expect(signal('I73', map(row('I10', 2), row('I73', 75 / 24))).score).toBeNull();
  });

  it('reduz cobertura em vez de derrubar score com estados incompletos', () => {
    const current = map(row('I26', 10), row('I28', 0), row('I29', 0), row('I30', 0));
    const full = buildProjectHealth(current);
    const partial = buildProjectHealth(
      map(row('I26', 10), row('I28', 0), row('I29', 0, { state: 'STALE' }), row('I30', 0))
    );
    expect(full.dimensions[0]).toMatchObject({ coverage: 100, score: 100 });
    expect(partial.dimensions[0]).toMatchObject({ coverage: 70, score: 100 });
    expect(partial.coverage).toBeLessThan(full.coverage);
    expect(full).toMatchObject({ score: null, status: 'UNASSESSED' });
    expect(
      buildProjectHealth(current, new Map(), {
        sprintApplicable: false,
        githubApplicable: false
      }).dimensions.filter((item) => !item.applicable)
    ).toHaveLength(2);
    const inactiveSprint = buildProjectHealth(
      map(row('I39', 10), row('I71', { addedCount: 5, removedCount: 0 })),
      new Map(),
      { sprintApplicable: false, githubApplicable: false }
    );
    expect(inactiveSprint.assessedSignals).toBe(0);
    expect(inactiveSprint.drivers.negative).toEqual([]);
  });

  it('calcula notas exatas preservando pesos e removendo apenas sinais não aplicáveis', () => {
    const current = map(
      row('I01', 80),
      row('I26', 10),
      row('I28', 0),
      row('I29', 0),
      row('I30', 0),
      row('I20', 6, { eligibleCount: 3 }),
      row('I21', 4, { eligibleCount: 3 }),
      row('I04', 10),
      row('I49', 70),
      row('I52', { PASS: 6, FAIL: 2, BLOCKED: 1, NEVER_EXECUTED: 1, total: 10 }),
      row('I58', 80),
      row('I64', 25),
      row('I61', 100),
      row('I62', 50),
      row('I63', 55),
      row('I65', 20),
      row('I66', 70)
    );
    const previous = map(row('I20', 4, { eligibleCount: 3 }), row('I21', 4, { eligibleCount: 3 }));
    const result = buildProjectHealth(current, previous, {
      sprintApplicable: false,
      githubApplicable: false
    });
    expect(result.dimensions.map((dimension) => dimension.score)).toEqual([
      100,
      80,
      null,
      71.18,
      100,
      null
    ]);
    expect(result).toMatchObject({
      score: 85.99,
      status: 'HEALTHY',
      coverage: 100,
      assessedDimensions: 4,
      applicableDimensions: 4
    });
    // Quality: (25*70 + 20*60 + 20*80 + 20*75) / 85, with I04 inapplicable.
    // With GitHub configured, the original signal weights and scores remain intact.
    const integrated = buildProjectHealth(current, previous, {
      sprintApplicable: false,
      githubApplicable: true
    });
    expect(integrated.dimensions.map((dimension) => dimension.score)).toEqual([
      100,
      80,
      null,
      74,
      79,
      null
    ]);
    expect(integrated).toMatchObject({
      score: 82.94,
      coverage: 94.12,
      assessedDimensions: 4,
      applicableDimensions: 5
    });
  });

  it('mantém limiares, pesos e drivers independentes de atividade pessoal', () => {
    expect([79.99, 80, 59.99, 60].map(healthStatus)).toEqual([
      'ATTENTION',
      'HEALTHY',
      'CRITICAL',
      'ATTENTION'
    ]);
    const base = map(row('I26', 10), row('I28', 5), row('I29', 3), row('I30', 4));
    const a = buildProjectHealth(base);
    const b = buildProjectHealth(
      map(...base.values(), row('I02', 100), row('I03', 100), row('I05', 100))
    );
    expect(b.dimensions).toEqual(a.dimensions);
    expect(b.coverage).toBe(a.coverage);
    expect(a.drivers.negative.map((driver) => driver.metricId)).toEqual(['I28', 'I30', 'I29']);
    expect(a.drivers.negative).toHaveLength(3);
  });

  it('recorta período futuro e cria baseline anterior sem overlap', () => {
    const asOf = new Date('2026-09-27T12:00:00Z');
    const automatic = healthWindow(null, asOf);
    expect(automatic.current.endExclusive).toEqual(asOf);
    expect(automatic.current.endExclusive - automatic.current.startInclusive).toBe(30 * 86400000);
    const requested = healthWindow(
      {
        startInclusive: new Date('2026-09-01T00:00:00Z'),
        endExclusive: new Date('2026-10-01T00:00:00Z'),
        timeZone: 'UTC'
      },
      asOf
    );
    expect(requested.current.endExclusive).toEqual(asOf);
    expect(requested.previous.endExclusive).toEqual(requested.current.startInclusive);
    expect(requested.previous.endExclusive - requested.previous.startInclusive).toBe(
      requested.current.endExclusive - requested.current.startInclusive
    );
  });
});

describe('P8.5 references derived from Model v1', () => {
  it.each([
    ['I20', 'DAYS'],
    ['I21', 'DAYS'],
    ['I15', 'HOURS']
  ])('exposes signed project baseline for %s without changing scores', (id, unit) => {
    const previous = map(row(id, 4, { eligibleCount: 3 }));
    expect(signal(id, map(row(id, 6, { eligibleCount: 3 })), previous)).toMatchObject({
      score: 50,
      reference: { type: 'PROJECT_BASELINE', value: 4, unit },
      delta: { value: 50, unit: 'PERCENT' }
    });
    expect(signal(id, map(row(id, 3, { eligibleCount: 3 })), previous)).toMatchObject({
      score: 100,
      delta: { value: -25 }
    });
    for (const current of [
      row(id, 6, { eligibleCount: 2 }),
      row(id, 6, { eligibleCount: 3, state: 'PARTIAL' })
    ])
      expect(signal(id, map(current), previous)).toMatchObject({ reference: null, delta: null });
    expect(
      signal(id, map(row(id, 6, { eligibleCount: 3 })), map(row(id, 0, { eligibleCount: 3 })))
    ).toMatchObject({ reference: null, delta: null });
  });
  it('uses existing Sprint, stage and merge bases with correct units', () => {
    expect(signal('I44', map(row('I44', { estimatedHours: 20, actualHours: 24 })))).toMatchObject({
      score: 80,
      reference: { value: 20, unit: 'HOURS' },
      delta: { value: 4, unit: 'HOURS' }
    });
    expect(
      signal(
        'I45',
        map(
          row('I45', null, {
            points: [
              { remaining: 20, ideal: 20 },
              { remaining: 12, ideal: 10 }
            ],
            coverage: { totalPoints: 20 }
          })
        )
      )
    ).toMatchObject({ score: 90, reference: { value: 10, unit: 'HOURS' }, delta: { value: 2 } });
    expect(signal('I62', map(row('I62', 60), row('I01', 80)))).toMatchObject({
      score: 80,
      reference: { value: 80, unit: 'PERCENT' },
      delta: { value: -20, unit: 'PERCENTAGE_POINTS' }
    });
    expect(
      signal('I73', map(row('I73', 3), row('I10', 2), row('I15', 48, { eligibleCount: 3 })))
    ).toMatchObject({
      score: 50,
      reference: { value: 2, unit: 'DAYS' },
      delta: { value: 50, unit: 'PERCENT' }
    });
    expect(signal('I47', map(row('I47', null)))).toMatchObject({
      status: 'NEUTRAL',
      reference: null,
      delta: null
    });
  });
});
