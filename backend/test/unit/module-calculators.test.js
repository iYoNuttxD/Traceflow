import { describe, expect, it } from 'vitest';
import {
  calculateCoveragePercentage as calculateRequirementCoverage,
  calculateRequirementStatus
} from '../../src/modules/requirements/requirement.schema.js';
import {
  buildCreatedAtFilter,
  calculateCoveragePercentage as calculateTaskCoverage
} from '../../src/modules/tasks/task.schema.js';

describe('cálculos extraídos de Requirements', () => {
  it('preserva a derivação atual de status a partir das tarefas', () => {
    expect(calculateRequirementStatus([])).toBe('CADASTRADO');
    expect(calculateRequirementStatus([{ status: 'A_FAZER' }])).toBe('APROVADO');
    expect(calculateRequirementStatus([{ status: 'CONCLUIDO' }])).toBe('VALIDADO');
    expect(
      calculateRequirementStatus([{ status: 'A_FAZER' }, { status: 'CONCLUIDO' }])
    ).toBe('EM_IMPLEMENTACAO');
  });

  it('preserva zero e arredondamento da cobertura requisito-tarefa', () => {
    expect(calculateRequirementCoverage(0, 0)).toBe(0);
    expect(calculateRequirementCoverage(1, 3)).toBe(33.33);
  });
});

describe('cálculos extraídos de Tasks', () => {
  it('preserva zero e arredondamento das coberturas técnicas', () => {
    expect(calculateTaskCoverage(0, 0)).toBe(0);
    expect(calculateTaskCoverage(2, 3)).toBe(66.67);
  });

  it('preserva o intervalo inclusivo por data usando limite final exclusivo', () => {
    expect(buildCreatedAtFilter('2026-01-02', '2026-01-03')).toEqual({
      gte: new Date('2026-01-02T00:00:00.000Z'),
      lt: new Date('2026-01-04T00:00:00.000Z')
    });
  });
});
