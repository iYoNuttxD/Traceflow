import { logger } from '../../shared/logger/index.js';
import { preferenceAllowsEvent } from './github-event.policy.js';
import { BATCH_LIMIT, noticeBatches, noticeRows } from './traceability-notice.policy.js';
import { traceabilityNoticeRepository } from './traceability-notice.repository.js';

const DEFAULT_ERROR_CODE = 'TRACEABILITY_NOTICES_DISPATCH_FAILED';
const SAFE_CODE = /^[A-Za-z0-9_]{1,64}$/;

function errorCodeOf(error) {
  const code = String(error?.code ?? '');
  return SAFE_CODE.test(code) ? code : DEFAULT_ERROR_CODE;
}

export function createTraceabilityNoticeService({
  repository = traceabilityNoticeRepository,
  log = logger,
  clock = () => new Date()
} = {}) {
  async function dispatchProject(projectId) {
    const alerts = await repository.pendingAlerts(projectId);
    const report = { alerts: alerts.length, batches: 0, summaries: 0, created: 0 };
    for (const batch of noticeBatches(alerts)) {
      const recipientIds = (await repository.activeRecipients(projectId, batch.detectedAt))
        .filter(({ preference }) => preferenceAllowsEvent(preference, batch.detectedAt))
        .map(({ userId }) => userId);
      report.created += await repository.insertNotices(noticeRows(projectId, batch, recipientIds));
      await repository.markDispatched(
        projectId,
        batch.alerts.map((alert) => alert.id),
        clock()
      );
      report.batches += 1;
      if (batch.alerts.length > BATCH_LIMIT) report.summaries += 1;
    }
    return report;
  }

  async function dispatchSafely(projectId, trigger) {
    try {
      const report = await dispatchProject(projectId);
      if (report.alerts)
        log.info('Avisos de inconsistência despachados.', {
          event: 'traceability_notices_dispatched',
          projectId,
          trigger,
          ...report
        });
      return report;
    } catch (error) {
      log.warn('Falha ao despachar os avisos de inconsistência; os alertas continuam pendentes.', {
        event: 'traceability_notices_dispatch_failed',
        projectId,
        trigger,
        errorCode: errorCodeOf(error)
      });
      return null;
    }
  }

  return {
    dispatchProject,
    dispatchSafely,

    async dispatchAll({ projectId = null, trigger = 'JOB' } = {}) {
      const projects = await repository.projectsWithPendingNotices(projectId);
      const report = { projects: projects.length, alerts: 0, created: 0, failed: 0 };
      for (const id of projects) {
        const result = await dispatchSafely(id, trigger);
        if (!result) {
          report.failed += 1;
          continue;
        }
        report.alerts += result.alerts;
        report.created += result.created;
      }
      return report;
    }
  };
}

export const traceabilityNoticeService = createTraceabilityNoticeService();
