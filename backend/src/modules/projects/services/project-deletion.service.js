import { randomUUID } from 'node:crypto';
import { AppError, ERROR_CODES, resourceNotFoundError } from '../../../shared/errors/index.js';
import { logger } from '../../../shared/logger/index.js';
import { buildAuditEvent } from '../../audit/audit.service.js';
import { testEvidenceStorage } from '../../testCases/storage/local-test-evidence.storage.js';
import { projectDeletionRepository } from '../project-deletion.repository.js';
import { parseProjectId, publicProject } from '../project.schema.js';

export const PROJECT_RECOVERY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const PROJECT_PURGE_STALE_AFTER_MS = 30 * 60 * 1000;

function operationalError(message, statusCode, code, details) {
  return new AppError({
    message,
    statusCode,
    code,
    details,
    exposeTechnicalDetails: true
  });
}

function throwOutcome(outcome, operation) {
  if (outcome === 'NOT_FOUND' || outcome === 'EXPIRED') throw resourceNotFoundError('Project');
  if (outcome === 'FORBIDDEN') {
    throw operationalError(
      operation === 'restore'
        ? 'Somente OWNER pode recuperar este projeto.'
        : 'Somente OWNER pode excluir este projeto.',
      403,
      operation === 'restore'
        ? ERROR_CODES.PROJECT_RESTORE_FORBIDDEN
        : ERROR_CODES.PROJECT_DELETION_FORBIDDEN
    );
  }
  if (outcome === 'ALREADY_DELETED') {
    throw operationalError(
      'O projeto já está programado para exclusão.',
      409,
      ERROR_CODES.PROJECT_ALREADY_DELETED
    );
  }
  if (outcome === 'INVALID_CONFIRMATION') {
    throw operationalError(
      'Digite exatamente o nome do projeto para confirmar.',
      400,
      ERROR_CODES.PROJECT_DELETION_CONFIRMATION_INVALID
    );
  }
  throw operationalError(
    'O projeto está sendo processado por outra operação.',
    409,
    ERROR_CODES.CONFLICT
  );
}

function pendingDetails(project) {
  return {
    projectId: project.id,
    projectName: project.name,
    deletionScheduledFor: project.deletionScheduledFor,
    repositoryIdentifier: project.githubIntegration?.githubRepositoryId || null,
    repositoryFullName: project.githubIntegration?.repositoryFullName || null
  };
}

function safeFailureCode(error) {
  return typeof error?.code === 'string' && /^[A-Z0-9_]{1,80}$/.test(error.code)
    ? error.code
    : 'STORAGE_CLEANUP_FAILED';
}

export function createProjectDeletionService({
  repository = projectDeletionRepository,
  storage = testEvidenceStorage,
  log = logger
} = {}) {
  async function reconcileStorageItem(item, token) {
    try {
      return await repository.cleanupReadyStorageItem(item.id, token, storage);
    } catch (error) {
      await repository.failStorageCleanup(item.id, token, safeFailureCode(error));
      log.error('Falha ao reconciliar evidência de projeto.', {
        event: 'project_purge_storage_cleanup_failed',
        projectId: item.projectId,
        errorCode: safeFailureCode(error)
      });
      return false;
    }
  }

  async function purgeClaimedProject(
    projectId,
    token,
    { actorUserId = null, now = new Date() } = {}
  ) {
    let prepared = [];
    try {
      const evidence = await repository.evidence(projectId);
      const cleanupItems = evidence.map(({ storageKey }) => ({
        storageKey,
        purgeKey: randomUUID()
      }));
      prepared = await repository.prepareStorageCleanup(projectId, token, cleanupItems, now);
      if (!prepared) throwOutcome('CONFLICT', 'delete');
      for (const item of prepared) {
        if (!(await repository.stageStorageItem(projectId, token, item, storage))) {
          throwOutcome('CONFLICT', 'delete');
        }
      }
      const deleted = await repository.deleteProjectGraph(
        projectId,
        token,
        buildAuditEvent({
          actorUserId,
          actorType: actorUserId ? 'USER' : 'SYSTEM',
          projectId,
          action: 'PROJECT_PURGED',
          resourceType: 'Project',
          resourceId: projectId,
          metadata: { projectId }
        })
      );
      if (!deleted)
        throw operationalError('Projeto não encontrado.', 404, ERROR_CODES.PROJECT_NOT_FOUND);
    } catch (error) {
      for (const item of (prepared ?? []).toReversed()) {
        try {
          await repository.restoreStorageItem(projectId, token, item, storage);
        } catch (restoreError) {
          log.error('Falha ao restaurar evidência após purge interrompido.', {
            event: 'project_purge_storage_restore_failed',
            projectId,
            errorCode: safeFailureCode(restoreError)
          });
        }
      }
      await repository.releasePurge(projectId, token);
      throw error;
    }

    const journal = await repository.pendingStorageCleanup({ projectId, readyOnly: true });
    let storageFailures = 0;
    for (const item of journal) {
      if (!(await reconcileStorageItem(item, token))) storageFailures += 1;
    }
    return { purged: true, storageFailures };
  }

  return {
    async requestDeletion(projectId, actorUserId, { now = new Date() } = {}) {
      const id = parseProjectId(projectId);
      const scheduledFor = new Date(now.getTime() + PROJECT_RECOVERY_WINDOW_MS);
      const result = await repository.requestDeletion({
        projectId: id,
        userId: actorUserId,
        now,
        scheduledFor,
        auditData: buildAuditEvent({
          actorUserId,
          projectId: id,
          action: 'PROJECT_DELETE_REQUESTED',
          resourceType: 'Project',
          resourceId: id,
          metadata: { projectId: id, scheduledFor: scheduledFor.toISOString() }
        })
      });
      if (result.outcome !== 'DELETED') throwOutcome(result.outcome, 'delete');
      return pendingDetails(result.project);
    },

    async restore(projectId, actorUserId, { now = new Date() } = {}) {
      const id = parseProjectId(projectId);
      const result = await repository.restore({
        projectId: id,
        userId: actorUserId,
        now,
        auditData: buildAuditEvent({
          actorUserId,
          projectId: id,
          action: 'PROJECT_RESTORED',
          resourceType: 'Project',
          resourceId: id,
          metadata: { projectId: id }
        })
      });
      if (result.outcome !== 'RESTORED') throwOutcome(result.outcome, 'restore');
      return publicProject(result.project);
    },

    async purge(projectId, actorUserId, confirmationName, { now = new Date() } = {}) {
      const id = parseProjectId(projectId);
      const claimed = await repository.claimPurge(id, now, {
        userId: actorUserId,
        confirmationName,
        staleBefore: new Date(now.getTime() - PROJECT_PURGE_STALE_AFTER_MS)
      });
      if (claimed.outcome !== 'CLAIMED') throwOutcome(claimed.outcome, 'delete');
      return purgeClaimedProject(id, claimed.token, { actorUserId, now });
    },

    async processDue({ now = new Date(), dryRun = true } = {}) {
      const due = await repository.dueProjects(now);
      if (dryRun) return { mode: 'dry-run', count: due.length };
      let processed = 0;
      let failed = 0;
      for (const { id } of due) {
        try {
          const claimed = await repository.claimPurge(id, now, {
            dueOnly: true,
            staleBefore: new Date(now.getTime() - PROJECT_PURGE_STALE_AFTER_MS)
          });
          if (claimed.outcome !== 'CLAIMED') continue;
          await purgeClaimedProject(id, claimed.token, { now });
          processed += 1;
        } catch (error) {
          failed += 1;
          log.error('Falha no purge agendado de projeto.', {
            event: 'project_scheduled_purge_failed',
            projectId: id,
            errorCode: safeFailureCode(error)
          });
        }
      }
      const pending = await repository.pendingStorageCleanup({ readyOnly: true });
      let storageRecovered = 0;
      for (const item of pending) {
        const token = await repository.claimReadyStorageCleanup(
          item.id,
          now,
          new Date(now.getTime() - PROJECT_PURGE_STALE_AFTER_MS)
        );
        if (token && (await reconcileStorageItem(item, token))) storageRecovered += 1;
      }
      return { mode: 'apply', count: due.length, processed, failed, storageRecovered };
    },

    pendingDetails
  };
}

export const projectDeletionService = createProjectDeletionService();
