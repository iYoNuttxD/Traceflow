import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/traceability/traceability-alert.repository.js', () => ({
  traceabilityAlertRepository: {}
}));

const { createTraceabilityAlertService } =
  await import('../../src/modules/traceability/traceability-alert.service.js');

const now = new Date('2026-10-07T12:00:00.000Z');
let log;

function service(repository) {
  return createTraceabilityAlertService(repository, log, () => now);
}

beforeEach(() => {
  log = { info: vi.fn(), warn: vi.fn() };
});

describe('S2-01 serviço de alertas: reconciliação', () => {
  it('I13 erro na reconciliação pós-sync vira log e devolve null', async () => {
    const alerts = service({
      reconcileProject: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('deadlock'), { code: 'P2034' }))
    });

    await expect(alerts.reconcileAfterSync(7)).resolves.toBeNull();
    expect(log.warn).toHaveBeenCalledWith(expect.any(String), {
      event: 'traceability_alerts_reconcile_failed',
      projectId: 7,
      trigger: 'GITHUB_SYNC',
      errorCode: 'P2034'
    });
  });

  it('erro sem código usa o código padrão de falha', async () => {
    const alerts = service({ reconcileProject: vi.fn().mockRejectedValue(new Error('x')) });

    await alerts.reconcileAfterSync(7);

    expect(log.warn.mock.calls[0][1].errorCode).toBe('TRACEABILITY_ALERTS_RECONCILE_FAILED');
  });

  it('projeto inativo é ignorado sem log de falha', async () => {
    const alerts = service({
      reconcileProject: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('Projeto não encontrado.'), { statusCode: 404 }))
    });

    await expect(alerts.reconcileAfterSync(7)).resolves.toBeNull();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('sucesso registra contagens e gatilho, sem conteúdo de alerta', async () => {
    const reconcileProject = vi.fn().mockResolvedValue({ created: 2, resolved: 1, kept: 4 });

    await service({ reconcileProject }).reconcileAfterSync(7);

    expect(reconcileProject).toHaveBeenCalledWith(7, { dryRun: false, now });
    const [, fields] = log.info.mock.calls[0];
    expect(fields).toEqual({
      event: 'traceability_alerts_reconciled',
      projectId: 7,
      trigger: 'GITHUB_SYNC',
      created: 2,
      resolved: 1,
      kept: 4,
      durationMs: expect.any(Number)
    });
  });

  it('dry-run não registra log de reconciliação aplicada', async () => {
    const reconcileProject = vi.fn().mockResolvedValue({ created: 3, resolved: 0, kept: 0 });

    await service({ reconcileProject }).reconcileProject(7, { dryRun: true, trigger: 'SCRIPT' });

    expect(reconcileProject).toHaveBeenCalledWith(7, { dryRun: true, now });
    expect(log.info).not.toHaveBeenCalled();
  });

  it('reconcilia todos os projetos ativos e pula o que ficou inativo no caminho', async () => {
    const reconcileProject = vi
      .fn()
      .mockResolvedValueOnce({ created: 1, resolved: 0, kept: 0 })
      .mockRejectedValueOnce(
        Object.assign(new Error('Projeto não encontrado.'), { statusCode: 404 })
      )
      .mockResolvedValueOnce({ created: 0, resolved: 2, kept: 1 });
    const alerts = service({
      reconcileProject,
      findActiveProjectIds: vi.fn().mockResolvedValue([1, 2, 3])
    });

    await expect(alerts.reconcileAllProjects({ dryRun: true })).resolves.toEqual([
      { projectId: 1, created: 1, resolved: 0, kept: 0 },
      { projectId: 3, created: 0, resolved: 2, kept: 1 }
    ]);
  });

  it('erro que não é de projeto inativo interrompe a varredura de todos os projetos', async () => {
    const alerts = service({
      reconcileProject: vi.fn().mockRejectedValue(new Error('banco indisponível')),
      findActiveProjectIds: vi.fn().mockResolvedValue([1])
    });

    await expect(alerts.reconcileAllProjects({ dryRun: false })).rejects.toThrow(
      'banco indisponível'
    );
  });
});
