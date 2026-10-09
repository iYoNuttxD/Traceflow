import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAuditEvent, minimizeAuditMetadata } from '../../src/modules/audit/audit.service.js';
import { privacyService } from '../../src/modules/privacy/privacy.service.js';
import { privacyRepository } from '../../src/modules/privacy/privacy.repository.js';
import { runPrivacyRetention } from '../../src/shared/maintenance/privacy-retention.js';
import { createEnvironment } from '../../src/config/env.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
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
    try {
      expect(event.retentionUntil).toEqual(new Date('2030-01-31T00:00:00.000Z'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('valida configuração de governança', () => {
    const configuration = createEnvironment({
      NODE_ENV: 'test',
      TEST_DATABASE_URL: 'mysql://u:p@localhost/traceflow_test'
    });
    expect(configuration).toMatchObject({
      auditRetentionDays: 365,
      exportFileTtlMinutes: 15,
      accountDeletionGraceDays: 30
    });
    expect(() =>
      createEnvironment({
        NODE_ENV: 'test',
        TEST_DATABASE_URL: 'mysql://u:p@localhost/traceflow_test',
        AUDIT_RETENTION_DAYS: '2'
      })
    ).toThrow(/AUDIT_RETENTION_DAYS/);
  });

  it('faz dry-run sem apagar e apply com filtros de retenção e evento técnico', async () => {
    const now = new Date('2030-02-01T00:00:00.000Z');
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
        now,
        apply: false,
        configuration: { auditRetentionDays: 30, privacyRequestRetentionDays: 30 }
      })
    ).toMatchObject({ mode: 'dry-run', counts: { auditEvents: 2 } });
    expect(client.$transaction).not.toHaveBeenCalled();
    expect(
      await runPrivacyRetention({
        client,
        now,
        apply: true,
        configuration: { auditRetentionDays: 30, privacyRequestRetentionDays: 30 }
      })
    ).toMatchObject({ mode: 'apply' });
    expect(tx.privacyRequest.deleteMany).toHaveBeenCalledExactlyOnceWith({
      where: {
        status: { in: ['COMPLETED', 'CANCELLED', 'REJECTED'] },
        updatedAt: { lt: new Date('2030-01-02T00:00:00.000Z') }
      }
    });
    expect(tx.auditEvent.deleteMany).toHaveBeenCalledExactlyOnceWith({
      where: { retentionUntil: { lt: now } }
    });
    expect(tx.personalDataExport.deleteMany).toHaveBeenCalledExactlyOnceWith({
      where: { expiresAt: { lt: now } }
    });
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'RETENTION_CLEANUP_EXECUTED' })
      })
    );
  });

  it('processa anonimização vencida e contabiliza impedimento de governança', async () => {
    vi.spyOn(privacyRepository, 'dueDeletionRequests').mockResolvedValue([
      { id: 1, userId: 4, user: { githubIdentity: null } },
      { id: 2, userId: 5, user: { githubIdentity: null } }
    ]);
    const anonymize = vi
      .spyOn(privacyRepository, 'anonymize')
      .mockResolvedValueOnce({ userId: 4, requestId: 1 })
      .mockResolvedValueOnce({ userId: 5, requestId: 2, blocked: true });
    expect(await privacyService.processDueDeletions({ dryRun: true })).toEqual({
      mode: 'dry-run',
      count: 2
    });
    expect(anonymize).not.toHaveBeenCalled();
    expect(await privacyService.processDueDeletions({ dryRun: false })).toEqual({
      mode: 'apply',
      count: 2,
      processed: 1,
      blocked: 1,
      failed: 0
    });
    expect(anonymize).toHaveBeenCalledTimes(2);
    for (const [index, requestId, userId] of [
      [1, 1, 4],
      [2, 2, 5]
    ]) {
      expect(anonymize).toHaveBeenNthCalledWith(
        index,
        requestId,
        expect.objectContaining({ name: 'Usuário excluído', githubUserFingerprint: null }),
        expect.objectContaining({
          completedAuditData: expect.objectContaining({
            actorUserId: userId,
            resourceId: String(userId),
            action: 'ACCOUNT_ANONYMIZED'
          })
        }),
        expect.any(Date)
      );
    }
    vi.restoreAllMocks();
  });

  it('registra falha de anonimização com código seguro e libera retry', async () => {
    vi.spyOn(privacyRepository, 'dueDeletionRequests').mockResolvedValue([
      { id: 9, userId: 7, user: { githubIdentity: null } }
    ]);
    vi.spyOn(privacyRepository, 'anonymize').mockRejectedValue(
      new Error('token=segredo-nao-pode-aparecer')
    );
    const markFailure = vi
      .spyOn(privacyRepository, 'markDeletionFailure')
      .mockResolvedValue({ count: 1 });

    expect(await privacyService.processDueDeletions({ dryRun: false })).toMatchObject({
      count: 1,
      processed: 0,
      blocked: 0,
      failed: 1
    });
    expect(markFailure).toHaveBeenCalledWith(
      9,
      'ANONYMIZATION_FAILED',
      expect.objectContaining({
        action: 'ACCOUNT_ANONYMIZATION_FAILED',
        result: 'FAILURE',
        reasonCode: 'ANONYMIZATION_FAILED'
      }),
      expect.any(Date)
    );
    expect(JSON.stringify(markFailure.mock.calls)).not.toContain('segredo-nao-pode-aparecer');
    vi.restoreAllMocks();
  });
});
