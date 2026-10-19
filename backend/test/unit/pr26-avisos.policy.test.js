import { describe, expect, it, vi } from 'vitest';
import { toNotificationDTO } from '../../src/modules/notifications/notification.mapper.js';
import {
  batchSummaryOf,
  noticeBatches,
  noticeLink,
  noticeRows
} from '../../src/modules/notifications/traceability-notice.policy.js';
import { createTraceabilityNoticeService } from '../../src/modules/notifications/traceability-notice.service.js';
import { createTraceabilityAlertService } from '../../src/modules/traceability/traceability-alert.service.js';

const TYPE = 'TRACEABILITY_INCONSISTENCY';
const DETECTED = new Date('2026-10-15T12:00:00.000Z');
const LATER = new Date('2026-10-15T12:15:00.000Z');

const alert = (id, type = 'PULL_REQUEST_MERGED_WITHOUT_TASK', detectedAt = DETECTED) => ({
  id,
  type,
  subjectCode: type === 'ISSUE_CLOSED_WITHOUT_TASK' ? `Issue #${id}` : `PR #${id}`,
  subjectTitle: `Artefato ${id}`,
  occurredAt: new Date('2026-10-10T12:00:00.000Z'),
  detectedAt,
  pullRequest:
    type === 'PULL_REQUEST_MERGED_WITHOUT_TASK'
      ? { githubUrl: `https://github.com/o/r/pull/${id}` }
      : null,
  issue:
    type === 'ISSUE_CLOSED_WITHOUT_TASK'
      ? { githubUrl: `https://github.com/o/r/issues/${id}` }
      : null
});

describe('PR #26 avisos de inconsistência — política (TF-REV-008, ⚑4)', () => {
  it('A-P01 até 10 alertas sai um aviso por alerta e pessoa; acima de 10, um resumo por pessoa', () => {
    const ten = {
      detectedAt: DETECTED,
      alerts: Array.from({ length: 10 }, (_, i) => alert(i + 1))
    };
    const eleven = {
      detectedAt: DETECTED,
      alerts: [
        ...Array.from({ length: 8 }, (_, i) => alert(i + 1)),
        ...Array.from({ length: 3 }, (_, i) => alert(i + 20, 'ISSUE_CLOSED_WITHOUT_TASK'))
      ]
    };

    const individual = noticeRows(7, ten, [3, 4]);
    const summary = noticeRows(7, eleven, [3, 4]);

    expect(individual).toHaveLength(20);
    expect(individual[0]).toEqual({
      recipientUserId: 3,
      projectId: 7,
      type: TYPE,
      dedupeKey: `${TYPE}:alert:1`,
      traceabilityAlertId: 1,
      githubEvent: 'PULL_REQUEST_MERGED',
      artifactNumber: 1,
      artifactTitle: 'Artefato 1',
      artifactUrl: 'https://github.com/o/r/pull/1',
      githubOccurredAt: new Date('2026-10-10T12:00:00.000Z')
    });
    expect(summary).toEqual(
      [3, 4].map((recipientUserId) => ({
        recipientUserId,
        projectId: 7,
        type: TYPE,
        dedupeKey: `${TYPE}:batch:7:${DETECTED.getTime()}`,
        batchSummary: { total: 11, pullRequests: 8, issues: 3 }
      }))
    );
    expect(batchSummaryOf(eleven.alerts)).toEqual({ total: 11, pullRequests: 8, issues: 3 });
    expect(noticeRows(7, ten, [])).toEqual([]);
  });

  it('A-P02 o lote é a mesma detecção; URL fora do GitHub sai nula', () => {
    const batches = noticeBatches([alert(1), alert(2, undefined, LATER), alert(3)]);

    expect(batches.map((batch) => [batch.detectedAt, batch.alerts.map((a) => a.id)])).toEqual([
      [DETECTED, [1, 3]],
      [LATER, [2]]
    ]);
    const forged = { ...alert(5), pullRequest: { githubUrl: 'https://evil.example/pull/5' } };
    expect(
      noticeRows(7, { detectedAt: DETECTED, alerts: [forged] }, [3])[0].artifactUrl
    ).toBeNull();
  });

  it('A-P03 o DTO não tem tarefa, mostra o estado atual do alerta e leva à lista do Repositório', () => {
    const row = {
      id: 90,
      type: TYPE,
      projectId: 7,
      taskId: null,
      taskTitle: null,
      githubEvent: 'ISSUE_CLOSED',
      artifactNumber: 45,
      artifactTitle: 'Corrigir login',
      artifactUrl: 'https://github.com/o/r/issues/45',
      githubOccurredAt: new Date('2026-10-11T12:00:00.000Z'),
      traceabilityAlertId: 12,
      traceabilityAlert: {
        id: 12,
        type: 'ISSUE_CLOSED_WITHOUT_TASK',
        status: 'RESOLVED',
        resolvedAt: LATER,
        dismissedAt: null
      },
      batchSummary: null,
      readAt: null,
      createdAt: DETECTED,
      project: { id: 7, name: 'Projeto' }
    };

    expect(toNotificationDTO(row)).toMatchObject({
      task: null,
      link: '/projects/7/repository?alerta=12',
      context: {
        artifact: { kind: 'ISSUE', number: 45, url: 'https://github.com/o/r/issues/45' },
        alert: { id: 12, status: 'RESOLVED', resolvedAt: LATER },
        batch: null
      }
    });
    expect(
      toNotificationDTO({
        ...row,
        traceabilityAlertId: null,
        traceabilityAlert: null,
        githubEvent: null,
        artifactNumber: null,
        artifactTitle: null,
        artifactUrl: null,
        githubOccurredAt: null,
        batchSummary: { total: 12, pullRequests: 9, issues: 3 }
      })
    ).toMatchObject({
      task: null,
      link: '/projects/7/repository?inconsistencia=OPEN',
      context: { artifact: null, alert: null, batch: { total: 12, pullRequests: 9, issues: 3 } }
    });
    expect(noticeLink(7, null)).toBe('/projects/7/repository?inconsistencia=OPEN');
  });
});

describe('PR #26 avisos de inconsistência — despacho (TF-REV-008)', () => {
  function repository(alerts, recipients) {
    return {
      pendingAlerts: vi.fn(async () => alerts),
      activeRecipients: vi.fn(async () => recipients),
      insertNotices: vi.fn(async (rows) => rows.length),
      markDispatched: vi.fn(async (_projectId, ids) => ids.length),
      projectsWithPendingNotices: vi.fn(async () => [7, 8])
    };
  }

  it('A-P04 filtra a preferência pela detecção, despacha cada lote e marca os alertas', async () => {
    const repo = repository(
      [alert(1), alert(2, undefined, LATER)],
      [
        { userId: 3, preference: null },
        { userId: 4, preference: { enabled: false, enabledAt: null } },
        { userId: 5, preference: { enabled: true, enabledAt: LATER } }
      ]
    );
    const log = { info: vi.fn(), warn: vi.fn() };
    const service = createTraceabilityNoticeService({ repository: repo, log, clock: () => LATER });

    const report = await service.dispatchProject(7);

    expect(report).toEqual({ alerts: 2, batches: 2, summaries: 0, created: 3 });
    expect(
      repo.insertNotices.mock.calls.map(([rows]) => rows.map((row) => row.recipientUserId))
    ).toEqual([[3], [3, 5]]);
    expect(repo.markDispatched.mock.calls).toEqual([
      [7, [1], LATER],
      [7, [2], LATER]
    ]);
  });

  it('A-P05 a falha volta nula com código seguro no log, e o despacho geral conta a falha', async () => {
    const repo = repository([alert(1)], [{ userId: 3, preference: null }]);
    repo.insertNotices
      .mockRejectedValueOnce(Object.assign(new Error('título sensível'), { code: 'P2034' }))
      .mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'código com espaço' }));
    const log = { info: vi.fn(), warn: vi.fn() };
    const service = createTraceabilityNoticeService({ repository: repo, log });

    expect(await service.dispatchSafely(7, 'MANUAL')).toBeNull();
    expect(await service.dispatchAll()).toEqual({ projects: 2, alerts: 1, created: 1, failed: 1 });
    expect(log.warn.mock.calls.map(([, fields]) => fields)).toEqual([
      {
        event: 'traceability_notices_dispatch_failed',
        projectId: 7,
        trigger: 'MANUAL',
        errorCode: 'P2034'
      },
      {
        event: 'traceability_notices_dispatch_failed',
        projectId: 7,
        trigger: 'JOB',
        errorCode: 'TRACEABILITY_NOTICES_DISPATCH_FAILED'
      }
    ]);
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain('sensível');
  });

  it('A-P06 a reconciliação despacha os avisos depois de gravar; dry-run e falha não despacham', async () => {
    const notices = { dispatchSafely: vi.fn() };
    const log = { info: vi.fn(), warn: vi.fn() };
    const reconcileProject = vi
      .fn()
      .mockResolvedValueOnce({ created: 1, resolved: 0, kept: 0 })
      .mockResolvedValueOnce({ created: 1, resolved: 0, kept: 0 })
      .mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'P2034' }));
    const alerts = createTraceabilityAlertService(
      { reconcileProject, recordAttempt: vi.fn(), recordReconciliation: vi.fn() },
      log,
      () => DETECTED,
      { recordOperational: vi.fn() },
      notices
    );

    await alerts.reconcileAfterSync(7);
    await alerts.reconcileProject(7, { dryRun: true, trigger: 'SCRIPT' });
    await alerts.reconcileAfterSync(7);

    expect(notices.dispatchSafely.mock.calls).toEqual([[7, 'GITHUB_SYNC']]);
  });
});
