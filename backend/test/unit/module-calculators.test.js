import { describe, expect, it } from 'vitest';
import { calculateRequirementStatus } from '../../src/modules/requirements/requirement.schema.js';
import { buildCreatedAtFilter } from '../../src/modules/tasks/task.schema.js';
import { buildCoverageMetric } from '../../src/modules/traceability/traceability.calculator.js';

describe('cálculos extraídos de Requirements', () => {
  it('preserva a derivação atual de status a partir das tarefas', () => {
    expect(calculateRequirementStatus([])).toBe('CADASTRADO');
    expect(calculateRequirementStatus([{ status: 'A_FAZER' }])).toBe('APROVADO');
    expect(calculateRequirementStatus([{ status: 'CONCLUIDO' }])).toBe('VALIDADO');
    expect(calculateRequirementStatus([{ status: 'A_FAZER' }, { status: 'CONCLUIDO' }])).toBe(
      'EM_IMPLEMENTACAO'
    );
  });

  it('usa a fórmula canônica de cobertura e distingue zero de ausência', () => {
    expect(buildCoverageMetric(0, 0)).toEqual({
      numerator: 0,
      denominator: 0,
      percentage: null,
      hasData: false
    });
    expect(buildCoverageMetric(2, 3)).toEqual({
      numerator: 2,
      denominator: 3,
      percentage: 66.67,
      hasData: true
    });
  });
});

describe('cálculos extraídos de Tasks', () => {
  it('preserva o intervalo inclusivo por data usando limite final exclusivo', () => {
    expect(buildCreatedAtFilter('2026-01-02', '2026-01-03')).toEqual({
      gte: new Date('2026-01-02T00:00:00.000Z'),
      lt: new Date('2026-01-04T00:00:00.000Z')
    });
  });
});
