import { describe, expect, it, vi } from 'vitest';
import { createTraceabilityAlertService } from '../../src/modules/traceability/traceability-alert.service.js';

function serviceWith(repository) {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const audit = { recordOperational: vi.fn() };
  return {
    log,
    alerts: createTraceabilityAlertService(
      repository,
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
