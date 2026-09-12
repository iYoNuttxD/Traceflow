import { describe, expect, it } from 'vitest';
import { deriveRequirementLifecycleStatus } from '../../src/modules/traceability/requirement-traceability.policy.js';
import { buildCreatedAtFilter } from '../../src/modules/tasks/task.schema.js';
import { buildCoverageMetric } from '../../src/modules/traceability/traceability.calculator.js';

describe('cálculos extraídos de Requirements', () => {
  it.each([
    ['SEM_RASTREABILIDADE', 'PLANEJADO'],
    ['PLANEJADO', 'PLANEJADO'],
    ['EM_DESENVOLVIMENTO', 'EM_IMPLEMENTACAO'],
    ['IMPLEMENTADO', 'EM_IMPLEMENTACAO'],
    ['AGUARDANDO_VALIDACAO', 'EM_VALIDACAO'],
    ['EM_VALIDACAO', 'EM_VALIDACAO'],
    ['VALIDADO', 'EM_VALIDACAO'],
    ['COM_FALHA', 'EM_CORRECAO'],
    ['EM_CORRECAO', 'EM_CORRECAO'],
    ['AGUARDANDO_RETESTE', 'EM_CORRECAO'],
    ['CONCLUIDO', 'CONCLUIDO']
  ])('derives macro lifecycle from %s', (situation, status) =>
    expect(deriveRequirementLifecycleStatus(situation)).toBe(status)
  );

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
