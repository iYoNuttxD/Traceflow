import { describe, expect, it } from 'vitest';
import {
  indicatorAuditDetails,
  presentFormula
} from '../../src/features/indicators/indicator-audit-display.js';
import { INDICATORS } from '../../../backend/src/modules/indicators/indicators.catalog.js';

describe('RF55 metadata presentation', () => {
  it('translates the API-owned expressions without a frontend formula registry', () => {
    for (const definition of Object.values(INDICATORS)) {
      const details = indicatorAuditDetails({
        ...definition,
        state: 'AVAILABLE',
        asOf: '2026-10-05T12:00:00Z'
      });
      expect(details.formula).not.toMatch(
        /\b(?:I\d\d|RF\d+|[A-Za-z]+\.[A-Za-z]+|[a-z]+[A-Z][a-z]+|[A-Z]+_[A-Z]+|COUNT|SUM|MEDIAN|MEAN|Task|Tasks|Defect|Requirement|TestCase)\b/
      );
      expect(details.sources.length).toBeGreaterThan(0);
      expect(details.sources.join(' ')).not.toMatch(/S1-09|SprintTask|TaskMovement|\.[a-z]/);
    }
  });
  it('presents the supplied formula rather than choosing one by metric ID', () => {
    expect(presentFormula('PASS / (PASS + FAIL) × 100')).toBe(
      'aprovadas / (aprovadas + falhas) × 100'
    );
    expect(presentFormula('MEDIAN(primeira conclusão − Task.createdAt)')).toBe(
      'Mediana(primeira conclusão − criação da tarefa)'
    );
  });
  it('never substitutes asOf for missing external freshness, including NO_DATA', () => {
    const details = indicatorAuditDetails({
      state: 'NO_DATA',
      sources: ['PullRequest.state'],
      formula: 'COUNT PullRequest.state=open',
      sourceUpdatedAt: null,
      asOf: '2026-10-05T12:00:00Z'
    });
    expect(details.clockLabel).toBe('Fonte atualizada');
    expect(details.clock).toBe('Indisponível no momento.');
    expect(details.sources).toEqual(['Pull Requests sincronizadas do GitHub']);
  });
  it('does not format missing or invalid clocks as a date', () => {
    for (const asOf of [null, 'invalid'])
      expect(indicatorAuditDetails({ sources: ['Task.status'], asOf }).clock).toBe(
        'Indisponível no momento.'
      );
  });
  it.each(['S1-09 technicalEvidence', 'S1-09 situation', 'S1-09 implementation'])(
    'uses external freshness for the dependent projection %s',
    (source) => {
      const details = indicatorAuditDetails({
        state: 'AVAILABLE',
        sources: [source],
        sourceUpdatedAt: '2026-09-20T12:00:00Z',
        asOf: '2026-10-05T12:00:00Z'
      });
      expect(details.clockLabel).toBe('Fonte atualizada');
      expect(details.clock).toContain('20/09/2026');
      expect(details.clock).not.toContain('05/10/2026');
    }
  );
});
