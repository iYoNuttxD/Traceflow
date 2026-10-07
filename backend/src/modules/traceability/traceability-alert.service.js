import { AppError, ERROR_CODES } from '../../shared/errors/index.js';
import { logger } from '../../shared/logger/index.js';
import { auditService, buildAuditEvent } from '../audit/audit.service.js';
import {
  alertPermissions,
  toAlertDTO,
  toAlertDetailDTO,
  toAlertSummaryDTO,
  toUnlinkedTaskDTO
} from './traceability-alert.mapper.js';
import { traceabilityAlertRepository } from './traceability-alert.repository.js';

const MANAGER_ROLES = new Set(['MANAGER', 'OWNER']);

function isInactiveProject(error) {
  return error?.statusCode === 404;
}

function alertNotFound() {
  return new AppError({
    message: 'Alerta não encontrado neste projeto.',
    statusCode: 404,
    code: ERROR_CODES.TRACEABILITY_ALERT_NOT_FOUND,
    exposeTechnicalDetails: true
  });
}

function alertNotOpen() {
  return new AppError({
    message: 'Este alerta já foi resolvido e não pode ser dispensado.',
    statusCode: 409,
    code: ERROR_CODES.TRACEABILITY_ALERT_NOT_OPEN,
    exposeTechnicalDetails: true
  });
}

function forbidden() {
  return new AppError({
    message: 'Você não possui permissão para esta operação.',
    statusCode: 403,
    code: ERROR_CODES.FORBIDDEN,
    exposeTechnicalDetails: true
  });
}

function pageOf(query = {}) {
  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 100);
  return { page, limit, skip: (page - 1) * limit };
}

function pagination({ page, limit }, total) {
  return { page, limit, total, totalPages: total ? Math.ceil(total / limit) : 0 };
}

export function createTraceabilityAlertService(
  repository = traceabilityAlertRepository,
  log = logger,
  clock = () => new Date(),
  audit = auditService
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

  async function requireManager(projectId, actorUserId) {
    if (!Number.isInteger(actorUserId)) throw forbidden();
    const role = await repository.findMembershipRole(projectId, actorUserId);
    if (!MANAGER_ROLES.has(role)) throw forbidden();
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
    },

    async reconcileManually(projectId, context) {
      const id = Number(projectId);
      await requireManager(id, context.actorUserId);
      const result = await reconcile(id, { dryRun: false, trigger: 'MANUAL' });
      await audit.recordOperational({
        actorUserId: context.actorUserId,
        projectId: id,
        requestId: context.requestId,
        action: 'TRACEABILITY_ALERTS_RECONCILED',
        resourceType: 'Project',
        resourceId: id,
        metadata: { created: result.created, resolved: result.resolved }
      });
      return { projectId: id, result };
    },

    async list(projectId, query = {}, context = {}) {
      const id = Number(projectId);
      const page = pageOf(query);
      const status = query.status || 'OPEN';
      const type = query.type || null;
      const { total, alerts } = await repository.list(id, {
        status,
        type,
        skip: page.skip,
        take: page.limit
      });
      return {
        projectId: id,
        status,
        type,
        alerts: alerts.map(toAlertDTO),
        pagination: pagination(page, total),
        permissions: alertPermissions(context.role)
      };
    },

    async summary(projectId, context = {}) {
      const id = Number(projectId);
      return {
        ...toAlertSummaryDTO({ projectId: id, ...(await repository.summary(id)) }),
        permissions: alertPermissions(context.role)
      };
    },

    async get(projectId, alertId, context = {}) {
      const alert = await repository.findDetail(Number(projectId), Number(alertId));
      if (!alert) throw alertNotFound();
      return { alert: toAlertDetailDTO(alert), permissions: alertPermissions(context.role) };
    },

    async dismiss(projectId, alertId, body, context) {
      const id = Number(projectId);
      const alert = Number(alertId);
      await requireManager(id, context.actorUserId);
      const existing = await repository.findById(id, alert);
      if (!existing) throw alertNotFound();
      const result = await repository.dismiss({
        projectId: id,
        alertId: alert,
        userId: context.actorUserId,
        reason: body.reason,
        now: clock(),
        auditEvent: buildAuditEvent({
          actorUserId: context.actorUserId,
          projectId: id,
          requestId: context.requestId,
          action: 'TRACEABILITY_ALERT_DISMISSED',
          resourceType: 'TraceabilityAlert',
          resourceId: alert,
          metadata: { alertType: existing.type }
        })
      });
      if (result.outcome === 'NOT_FOUND') throw alertNotFound();
      if (result.outcome === 'INVALID_STATUS') throw alertNotOpen();
      return { alert: toAlertDTO(result.alert), changed: result.outcome === 'UPDATED' };
    },

    async listUnlinkedTasks(projectId, query = {}) {
      const id = Number(projectId);
      const page = pageOf(query);
      const status = query.status || null;
      const { total, tasks } = await repository.listUnlinkedTasks(id, {
        status,
        skip: page.skip,
        take: page.limit
      });
      return {
        projectId: id,
        status,
        tasks: tasks.map(toUnlinkedTaskDTO),
        pagination: pagination(page, total)
      };
    }
  };
}

export const traceabilityAlertService = createTraceabilityAlertService();
