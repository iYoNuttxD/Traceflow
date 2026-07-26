import { describe, expect, it, vi } from 'vitest';
import { buildAuditEvent, minimizeAuditMetadata } from '../../src/modules/audit/audit.service.js';
import { privacyService } from '../../src/modules/privacy/privacy.service.js';
import { privacyRepository } from '../../src/modules/privacy/privacy.repository.js';
import { runPrivacyRetention } from '../../src/shared/maintenance/privacy-retention.js';
import { createEnvironment } from '../../src/config/env.js';

describe('E7 auditoria, privacidade e retenção', () => {
  it('minimiza metadata e aplica retenção sem PII ou segredo', () => {
    expect(
      minimizeAuditMetadata({
        scope: 'account',
        count: 2,
        email: 'person@example.invalid',
        token: 'secret'
      })
    ).toEqual({ scope: 'account', count: 2 });
    const event = buildAuditEvent(
      { actorUserId: 3, action: 'TEST', resourceType: 'User' },
      { auditRetentionDays: 30 }
    );
    expect(event).toMatchObject({
      actorUserId: 3,
      actorType: 'USER',
      action: 'TEST',
      result: 'SUCCESS'
    });
    expect(event.retentionUntil.getTime()).toBeGreaterThan(Date.now());
  });

  it('valida configuração de governança', () => {
    const configuration = createEnvironment({
      NODE_ENV: 'test',
      TEST_DATABASE_URL: 'mysql://u:p@localhost/traceflow_test'
    });
    expect(configuration).toMatchObject({
      auditRetentionDays: 365,
      exportFileTtlMinutes: 15,
      accountDeletionGraceDays: 7
    });
    expect(() =>
      createEnvironment({
        NODE_ENV: 'test',
        TEST_DATABASE_URL: 'mysql://u:p@localhost/traceflow_test',
        AUDIT_RETENTION_DAYS: '2'
      })
    ).toThrow(/AUDIT_RETENTION_DAYS/);
  });

  it('faz dry-run sem apagar e apply idempotente com evento técnico', async () => {
    const tx = {
      auditEvent: { deleteMany: vi.fn(), create: vi.fn() },
      privacyRequest: { deleteMany: vi.fn() },
      personalDataExport: { deleteMany: vi.fn() }
    };
    const client = {
      auditEvent: { count: vi.fn().mockResolvedValue(2) },
      privacyRequest: { count: vi.fn().mockResolvedValue(1) },
      personalDataExport: { count: vi.fn().mockResolvedValue(3) },
      $transaction: vi.fn(async (callback) => callback(tx))
    };
    expect(
      await runPrivacyRetention({
        client,
        apply: false,
        configuration: { auditRetentionDays: 30, privacyRequestRetentionDays: 30 }
      })
    ).toMatchObject({ mode: 'dry-run', counts: { auditEvents: 2 } });
    expect(client.$transaction).not.toHaveBeenCalled();
    expect(
      await runPrivacyRetention({
        client,
        apply: true,
        configuration: { auditRetentionDays: 30, privacyRequestRetentionDays: 30 }
      })
    ).toMatchObject({ mode: 'apply' });
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'RETENTION_CLEANUP_EXECUTED' })
      })
    );
  });

  it('processa anonimização vencida sem espera e ignora último owner', async () => {
    vi.spyOn(privacyRepository, 'dueDeletionRequests').mockResolvedValue([
      { id: 1, userId: 4 },
      { id: 2, userId: 5 }
    ]);
    vi.spyOn(privacyRepository, 'lastOwnedProjects')
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 8, name: 'Projeto' }]);
    const anonymize = vi
      .spyOn(privacyRepository, 'anonymize')
      .mockResolvedValue({ userId: 4, requestId: 1 });
    expect(await privacyService.processDueDeletions({ dryRun: true })).toEqual({
      mode: 'dry-run',
      count: 2
    });
    expect(await privacyService.processDueDeletions({ dryRun: false })).toEqual({
      mode: 'apply',
      count: 2,
      processed: 1
    });
    expect(anonymize).toHaveBeenCalledOnce();
    vi.restoreAllMocks();
  });
});
