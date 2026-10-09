import { describe, expect, it, vi } from 'vitest';
import { createTraceabilityAlertService } from '../../src/modules/traceability/traceability-alert.service.js';

function serviceWith(repository) {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const audit = { recordOperational: vi.fn() };
  return {
    log,
    alerts: createTraceabilityAlertService(
      { recordReconciliation: vi.fn(), ...repository },
      log,
      () => new Date('2026-10-09T12:00:00.000Z'),
      audit
    )
  };
}

describe('Correções S2-01 — gatilho da conexão no serviço (S201-A01)', () => {
  it('C2-03 reconcilia o projeto com o gatilho GITHUB_INTEGRATION', async () => {
    const reconcileProject = vi.fn().mockResolvedValue({ created: 1, resolved: 0, kept: 0 });
    const { alerts, log } = serviceWith({ reconcileProject });

    await expect(alerts.reconcileAfterIntegration(7)).resolves.toEqual({
      created: 1,
      resolved: 0,
      kept: 0
    });
    expect(reconcileProject).toHaveBeenCalledWith(7, expect.objectContaining({ dryRun: false }));
    expect(log.info.mock.calls[0][1]).toMatchObject({
      projectId: 7,
      trigger: 'GITHUB_INTEGRATION'
    });
  });

  it('C2-04 falha vira log com o gatilho e o código, sem lançar', async () => {
    const { alerts, log } = serviceWith({
      reconcileProject: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('Título sensível'), { code: 'P2034' }))
    });

    await expect(alerts.reconcileAfterIntegration(7)).resolves.toBeNull();
    expect(log.warn).toHaveBeenCalledWith(expect.any(String), {
      event: 'traceability_alerts_reconcile_failed',
      projectId: 7,
      trigger: 'GITHUB_INTEGRATION',
      errorCode: 'P2034'
    });
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain('Título sensível');
  });

  it('C2-05 projeto inativo é ignorado sem log de falha', async () => {
    const { alerts, log } = serviceWith({
      reconcileProject: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('Projeto não encontrado.'), { statusCode: 404 }))
    });

    await expect(alerts.reconcileAfterIntegration(7)).resolves.toBeNull();
    expect(log.warn).not.toHaveBeenCalled();
  });
});

describe('Correções S2-01 — registro da última reconciliação no serviço (S201-A05)', () => {
  it('C3-06 sucesso e falha registram gatilho, instante e só o código do erro', async () => {
    const recordReconciliation = vi.fn();
    const reconcileProject = vi
      .fn()
      .mockResolvedValueOnce({ created: 0, resolved: 0, kept: 0 })
      .mockRejectedValueOnce(Object.assign(new Error('mensagem crua'), { code: 'X'.repeat(80) }));
    const { alerts } = serviceWith({ reconcileProject, recordReconciliation });

    await alerts.reconcileAfterSync(7);
    await alerts.reconcileAfterIntegration(7);

    expect(recordReconciliation.mock.calls.map(([call]) => call)).toEqual([
      {
        projectId: 7,
        trigger: 'GITHUB_SYNC',
        at: new Date('2026-10-09T12:00:00.000Z'),
        errorCode: null
      },
      {
        projectId: 7,
        trigger: 'GITHUB_INTEGRATION',
        at: new Date('2026-10-09T12:00:00.000Z'),
        errorCode: 'X'.repeat(64)
      }
    ]);
  });

  it('C3-07 falha ao gravar o registro só gera log e não muda o resultado', async () => {
    const { alerts, log } = serviceWith({
      reconcileProject: vi.fn().mockResolvedValue({ created: 1, resolved: 0, kept: 0 }),
      recordReconciliation: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('x'), { code: 'P2003' }))
    });

    await expect(alerts.reconcileAfterSync(7)).resolves.toEqual({
      created: 1,
      resolved: 0,
      kept: 0
    });
    expect(log.warn).toHaveBeenCalledWith(expect.any(String), {
      event: 'traceability_alerts_reconciliation_record_failed',
      projectId: 7,
      trigger: 'GITHUB_SYNC',
      errorCode: 'P2003'
    });
  });

  it('C3-08 projeto inativo e dry-run não registram', async () => {
    const recordReconciliation = vi.fn();
    const { alerts } = serviceWith({
      reconcileProject: vi
        .fn()
        .mockRejectedValueOnce(
          Object.assign(new Error('Projeto não encontrado.'), { statusCode: 404 })
        )
        .mockResolvedValueOnce({ created: 3, resolved: 0, kept: 0 }),
      recordReconciliation
    });

    await alerts.reconcileAfterSync(7);
    await alerts.reconcileProject(7, { dryRun: true, trigger: 'SCRIPT' });

    expect(recordReconciliation).not.toHaveBeenCalled();
  });
});
