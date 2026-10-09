import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/traceability/traceability-alert.repository.js', () => ({
  traceabilityAlertRepository: {}
}));

const { createTraceabilityAlertService } =
  await import('../../src/modules/traceability/traceability-alert.service.js');

const now = new Date('2026-10-07T12:00:00.000Z');
let log;
let audit;

function service(repository) {
  return createTraceabilityAlertService(
    { recordReconciliation: vi.fn(), ...repository },
    log,
    () => now,
    audit
  );
}

const managerContext = { actorUserId: 5, requestId: 'req-1', role: 'MANAGER' };
const issueAlertRow = {
  id: 40,
  type: 'ISSUE_CLOSED_WITHOUT_TASK',
  status: 'DISMISSED',
  occurredAt: now,
  detectedAt: now,
  resolvedAt: null,
  resolutionReason: null,
  dismissedAt: now,
  dismissalReason: 'Issue fechada como duplicada.',
  dismissedBy: { id: 5, name: 'Gestora', email: 'gestora@example.invalid' },
  subjectCode: 'Issue #9',
  subjectTitle: 'Erro',
  issue: { id: 3, number: 9, title: 'Erro atual', githubUrl: null }
};

beforeEach(() => {
  log = { info: vi.fn(), warn: vi.fn() };
  audit = { recordOperational: vi.fn().mockResolvedValue(undefined) };
});

describe('S2-01 serviço de alertas: dispensa e permissões', () => {
  it.each([
    ['UPDATED', 200, true],
    ['UNCHANGED', 200, false]
  ])('desfecho %s devolve o alerta e changed', async (outcome, _, changed) => {
    const dismiss = vi.fn().mockResolvedValue({ outcome, alert: issueAlertRow });
    const alerts = service({
      findMembershipRole: vi.fn().mockResolvedValue('MANAGER'),
      findById: vi.fn().mockResolvedValue({ id: 40, type: 'ISSUE_CLOSED_WITHOUT_TASK' }),
      dismiss
    });

    const result = await alerts.dismiss(
      '9',
      '40',
      { reason: 'Issue fechada como duplicada.' },
      managerContext
    );

    expect(result.changed).toBe(changed);
    expect(result.alert.dismissal).toEqual({
      at: now,
      reason: 'Issue fechada como duplicada.',
      by: { id: 5, name: 'Gestora' }
    });
    expect(dismiss).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 9,
        alertId: 40,
        userId: 5,
        now,
        auditEvent: expect.objectContaining({
          action: 'TRACEABILITY_ALERT_DISMISSED',
          resourceType: 'TraceabilityAlert',
          resourceId: '40',
          metadataJson: { alertType: 'ISSUE_CLOSED_WITHOUT_TASK' }
        })
      })
    );
  });

  it.each([
    ['NOT_FOUND', 404, 'TRACEABILITY_ALERT_NOT_FOUND'],
    ['INVALID_STATUS', 409, 'TRACEABILITY_ALERT_NOT_OPEN']
  ])('desfecho %s vira HTTP %i', async (outcome, statusCode, code) => {
    const alerts = service({
      findMembershipRole: vi.fn().mockResolvedValue('OWNER'),
      findById: vi.fn().mockResolvedValue({ id: 40, type: 'TASK_CONCLUDED_WITHOUT_COMMIT' }),
      dismiss: vi.fn().mockResolvedValue({ outcome })
    });

    await expect(
      alerts.dismiss(9, 40, { reason: 'Justificativa válida.' }, managerContext)
    ).rejects.toMatchObject({ statusCode, code });
  });

  it.each(['MEMBER', 'VIEWER', null])('revalida o papel no serviço e recusa %s', async (role) => {
    const dismiss = vi.fn();
    const reconcileProject = vi.fn();
    const alerts = service({
      findMembershipRole: vi.fn().mockResolvedValue(role),
      findById: vi.fn(),
      dismiss,
      reconcileProject
    });

    await expect(
      alerts.dismiss(9, 40, { reason: 'Justificativa válida.' }, managerContext)
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    await expect(alerts.reconcileManually(9, managerContext)).rejects.toMatchObject({
      statusCode: 403
    });
    expect(dismiss).not.toHaveBeenCalled();
    expect(reconcileProject).not.toHaveBeenCalled();
  });

  it('alerta inexistente no projeto responde 404 antes de dispensar', async () => {
    const dismiss = vi.fn();
    const alerts = service({
      findMembershipRole: vi.fn().mockResolvedValue('MANAGER'),
      findById: vi.fn().mockResolvedValue(null),
      dismiss
    });

    await expect(
      alerts.dismiss(9, 40, { reason: 'Justificativa válida.' }, managerContext)
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('reprocessamento manual audita as contagens', async () => {
    const alerts = service({
      findMembershipRole: vi.fn().mockResolvedValue('MANAGER'),
      reconcileProject: vi.fn().mockResolvedValue({ created: 2, resolved: 1, kept: 0 })
    });

    await expect(alerts.reconcileManually('9', managerContext)).resolves.toEqual({
      projectId: 9,
      result: { created: 2, resolved: 1, kept: 0 }
    });
    expect(audit.recordOperational).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'TRACEABILITY_ALERTS_RECONCILED',
        projectId: 9,
        metadata: { created: 2, resolved: 1 }
      })
    );
  });

  it('lista com paginação, padrão OPEN e permissões pelo papel', async () => {
    const list = vi.fn().mockResolvedValue({ total: 41, alerts: [issueAlertRow] });

    const result = await service({ list }).list(9, { page: 3, limit: 20 }, { role: 'VIEWER' });

    expect(list).toHaveBeenCalledWith(9, { status: 'OPEN', type: null, skip: 40, take: 20 });
    expect(result.pagination).toEqual({ page: 3, limit: 20, total: 41, totalPages: 3 });
    expect(result.permissions).toEqual({ canLink: false, canManage: false });
    expect(result.alerts[0].subject).toEqual({
      type: 'ISSUE',
      id: 3,
      code: 'Issue #9',
      title: 'Erro atual',
      available: true,
      githubUrl: null
    });
  });
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
