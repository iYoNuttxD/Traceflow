import { env } from '../../config/env.js';
import { AppError, ERROR_CODES } from '../../shared/errors/index.js';
import { auditRepository } from './audit.repository.js';
import { logger } from '../../shared/logger/index.js';

const day = 86400000;
const allowedMetadata = new Set([
  'previousRole',
  'newRole',
  'scope',
  'count',
  'format',
  'sessionId',
  'taskId',
  'commitId',
  'suggestionId'
]);

export function minimizeAuditMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  const safe = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (allowedMetadata.has(key) && ['string', 'number', 'boolean'].includes(typeof value))
      safe[key] = value;
  }
  return Object.keys(safe).length ? safe : undefined;
}

export function buildAuditEvent(data, configuration = env) {
  return {
    actorUserId: data.actorUserId ?? null,
    actorType: data.actorType || (data.actorUserId ? 'USER' : 'SYSTEM'),
    projectId: data.projectId ?? null,
    action: data.action,
    resourceType: data.resourceType,
    resourceId: data.resourceId == null ? null : String(data.resourceId),
    result: data.result || 'SUCCESS',
    reasonCode: data.reasonCode || null,
    requestId: data.requestId || null,
    metadataJson: minimizeAuditMetadata(data.metadata),
    retentionUntil: new Date(Date.now() + configuration.auditRetentionDays * day)
  };
}

function range(query) {
  const where = {};
  if (query.action) where.action = query.action;
  if (query.result) where.result = query.result;
  if (query.startDate || query.endDate)
    where.occurredAt = {
      ...(query.startDate ? { gte: new Date(`${query.startDate}T00:00:00.000Z`) } : {}),
      ...(query.endDate ? { lte: new Date(`${query.endDate}T23:59:59.999Z`) } : {})
    };
  return where;
}

async function page(where, query) {
  const pageNumber = query.page || 1;
  const limit = query.limit || 50;
  const [total, events] = await auditRepository.list({
    where,
    skip: (pageNumber - 1) * limit,
    take: limit
  });
  return { page: pageNumber, limit, total, events };
}

export const auditService = {
  record(data, client) {
    return auditRepository.create(buildAuditEvent(data), client);
  },
  async recordOperational(data) {
    try {
      return await auditRepository.create(buildAuditEvent(data));
    } catch (_error) {
      logger.error('Falha ao persistir auditoria operacional.', {
        event: 'audit_operational_fallback',
        action: data.action,
        requestId: data.requestId,
        errorCode: 'AUDIT_PERSISTENCE_FAILED'
      });
      return null;
    }
  },
  listAccount(userId, query) {
    return page({ actorUserId: userId, ...range(query) }, query);
  },
  async listProject(projectId, userId, query) {
    const membership = await auditRepository.findMembership(projectId, userId);
    if (!membership?.isActive)
      throw new AppError({
        message: 'Recurso não encontrado.',
        statusCode: 404,
        code: ERROR_CODES.RESOURCE_NOT_FOUND,
        exposeTechnicalDetails: true
      });
    if (membership.role !== 'OWNER')
      throw new AppError({
        message: 'Você não possui permissão para esta operação.',
        statusCode: 403,
        code: ERROR_CODES.FORBIDDEN,
        exposeTechnicalDetails: true
      });
    return page({ projectId, ...range(query) }, query);
  }
};
