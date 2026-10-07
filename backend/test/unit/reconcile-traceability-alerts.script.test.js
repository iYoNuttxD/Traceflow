import { describe, expect, it } from 'vitest';
import { parseAlertReconciliationArguments } from '../../scripts/reconcile-traceability-alerts.js';

describe('S2-01 script de reconciliação de alertas', () => {
  it('assume dry-run em todos os projetos ativos por padrão', () => {
    expect(parseAlertReconciliationArguments([])).toEqual({
      projectId: null,
      dryRun: true,
      confirmProduction: false
    });
  });

  it('aceita um projeto, --apply e a confirmação de produção', () => {
    expect(
      parseAlertReconciliationArguments(['--project-id=12', '--apply', '--confirm-production'])
    ).toEqual({ projectId: 12, dryRun: false, confirmProduction: true });
    expect(parseAlertReconciliationArguments(['--dry-run']).dryRun).toBe(true);
  });

  it.each([
    [['--project-id=0']],
    [['--project-id=abc']],
    [['--project-id=2147483648']],
    [['--apply', '--dry-run']],
    [['--policy']]
  ])('rejeita argumentos inválidos %j', (args) => {
    expect(() => parseAlertReconciliationArguments(args)).toThrow(/Uso:/);
  });
});
