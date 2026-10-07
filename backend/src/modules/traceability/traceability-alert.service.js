import { logger } from '../../shared/logger/index.js';
import { traceabilityAlertRepository } from './traceability-alert.repository.js';

function isInactiveProject(error) {
  return error?.statusCode === 404;
}

export function createTraceabilityAlertService(
  repository = traceabilityAlertRepository,
  log = logger,
  clock = () => new Date()
) {
  async function reconcile(projectId, { dryRun, trigger }) {
    const startedAt = Date.now();
    const result = await repository.reconcileProject(projectId, { dryRun, now: clock() });
    if (!dryRun)
      log.info('Alertas de rastreabilidade reconciliados.', {
        event: 'traceability_alerts_reconciled',
        projectId,
        trigger,
        created: result.created,
        resolved: result.resolved,
        kept: result.kept,
        durationMs: Date.now() - startedAt
      });
    return result;
  }

  return {
    reconcileProject(projectId, { dryRun = false, trigger = 'MANUAL' } = {}) {
      return reconcile(projectId, { dryRun, trigger });
    },

    async reconcileAfterSync(projectId) {
      try {
        return await reconcile(projectId, { dryRun: false, trigger: 'GITHUB_SYNC' });
      } catch (error) {
        if (isInactiveProject(error)) return null;
        log.warn('Falha ao reconciliar alertas de rastreabilidade após a sincronização.', {
          event: 'traceability_alerts_reconcile_failed',
          projectId,
          trigger: 'GITHUB_SYNC',
          errorCode: error?.code || 'TRACEABILITY_ALERTS_RECONCILE_FAILED'
        });
        return null;
      }
    },

    async reconcileAllProjects({ dryRun = true, trigger = 'SCRIPT' } = {}) {
      const projects = [];
      for (const projectId of await repository.findActiveProjectIds()) {
        try {
          projects.push({ projectId, ...(await reconcile(projectId, { dryRun, trigger })) });
        } catch (error) {
          if (!isInactiveProject(error)) throw error;
        }
      }
      return projects;
    }
  };
}

export const traceabilityAlertService = createTraceabilityAlertService();
