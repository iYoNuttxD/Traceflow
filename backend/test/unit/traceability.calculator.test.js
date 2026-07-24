import { describe, expect, it } from 'vitest';
import {
  buildRequirementMetrics,
  calculateProgress,
  getImplementationStatus
} from '../../src/modules/traceability/traceability.calculator.js';

describe('cálculos atuais de rastreabilidade', () => {
  it('preserva o percentual atual com duas casas decimais', () => {
    expect(calculateProgress([])).toBe(0);
    expect(calculateProgress([{ status: 'CONCLUIDO' }, { status: 'A_FAZER' }, { status: 'A_FAZER' }])).toBe(33.33);
  });

  it('preserva os estados atuais de implementação', () => {
    expect(getImplementationStatus({ status: 'CADASTRADO' }, [], false)).toBe('SEM_RASTREABILIDADE');
    expect(getImplementationStatus({ status: 'CADASTRADO' }, [{ status: 'A_FAZER' }], false)).toBe('PLANEJADO');
    expect(getImplementationStatus({ status: 'CADASTRADO' }, [{ status: 'CONCLUIDO' }], true)).toBe('IMPLEMENTADO');
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
