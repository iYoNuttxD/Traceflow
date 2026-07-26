import { describe, expect, it } from 'vitest';
import {
  buildRequirementMetrics,
  buildCoverageMetric,
  buildMatrixSummary,
  calculateProgress,
  getImplementationStatus
} from '../../src/modules/traceability/traceability.calculator.js';

describe('cálculos atuais de rastreabilidade', () => {
  it('distingue ausência de denominador de zero real e arredonda', () => {
    expect(calculateProgress([])).toEqual({
      numerator: 0,
      denominator: 0,
      percentage: null,
      hasData: false
    });
    expect(
      calculateProgress([{ status: 'CONCLUIDO' }, { status: 'A_FAZER' }, { status: 'A_FAZER' }])
    ).toEqual({ numerator: 1, denominator: 3, percentage: 33.33, hasData: true });
    expect(buildCoverageMetric(0, 10)).toEqual({
      numerator: 0,
      denominator: 10,
      percentage: 0,
      hasData: true
    });
  });

  it('calcula resumo global com o denominador de todas as linhas', () => {
    const summary = buildMatrixSummary([
      {
        tasksCount: 1,
        hasTechnicalEvidence: true,
        implementationStatus: 'IMPLEMENTADO',
        progress: { numerator: 1, denominator: 1 }
      },
      {
        tasksCount: 0,
        hasTechnicalEvidence: false,
        implementationStatus: 'SEM_RASTREABILIDADE',
        progress: { numerator: 0, denominator: 0 }
      }
    ]);
    expect(summary).toMatchObject({
      totalRequirements: 2,
      averageProgress: { numerator: 100, denominator: 2, percentage: 50, hasData: true }
    });
  });

  it('preserva os estados atuais de implementação', () => {
    expect(getImplementationStatus({ status: 'CADASTRADO' }, [], false)).toBe(
      'SEM_RASTREABILIDADE'
    );
    expect(getImplementationStatus({ status: 'CADASTRADO' }, [{ status: 'A_FAZER' }], false)).toBe(
      'PLANEJADO'
    );
    expect(getImplementationStatus({ status: 'CADASTRADO' }, [{ status: 'CONCLUIDO' }], true)).toBe(
      'IMPLEMENTADO'
    );
    expect(getImplementationStatus({ status: 'CONCLUIDO' }, [], false)).toBe('CONCLUIDO');
  });

  it('mantém issue isolada fora da evidência técnica', () => {
    const metrics = buildRequirementMetrics({
      status: 'CADASTRADO',
      tasks: [
        {
          status: 'A_FAZER',
          issueLinks: [{ issue: { id: 1 } }],
          commitLinks: [],
          pullRequest: null
        }
      ]
    });

    expect(metrics).toMatchObject({
      issuesCount: 1,
      commitsCount: 0,
      pullRequestsCount: 0,
      hasTechnicalEvidence: false,
      implementationStatus: 'PLANEJADO'
    });
  });
});
