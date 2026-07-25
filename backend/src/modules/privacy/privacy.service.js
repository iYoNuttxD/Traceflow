import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { AppError, ERROR_CODES } from '../../shared/errors/index.js';
import { authService } from '../auth/auth.service.js';
import { auditService, buildAuditEvent } from '../audit/audit.service.js';
import { privacyRepository } from './privacy.repository.js';

const invalidPassword = () => new AppError({ message: 'Senha atual inválida.', statusCode: 401, code: ERROR_CODES.INVALID_CREDENTIALS, exposeTechnicalDetails: true });
const notFound = () => new AppError({ message: 'Recurso não encontrado.', statusCode: 404, code: ERROR_CODES.RESOURCE_NOT_FOUND, exposeTechnicalDetails: true });

async function requirePassword(userId, password) {
  if (!(await authService.verifyPassword(userId, password))) throw invalidPassword();
}

async function ensureNoLastOwner(userId) {
  const projects = await privacyRepository.lastOwnedProjects(userId);
  if (projects.length) {
    throw new AppError({
      message: 'Transfira a propriedade dos projetos antes de continuar.',
      statusCode: 409,
      code: ERROR_CODES.LAST_PROJECT_OWNER,
      details: projects.map((project) => ({ projectId: project.id, name: project.name })),
      exposeTechnicalDetails: true
    });
  }
}

const audit = (userId, requestId, action, resourceType, resourceId, metadata) => buildAuditEvent({ actorUserId: userId, requestId, action, resourceType, resourceId, metadata });

export const privacyService = {
  async personalData(userId, currentSessionId) {
    const profile = await privacyRepository.personalData(userId);
    if (!profile) throw notFound();
    const [sessions, accountAudit, githubCommits] = await Promise.all([
      this.sessions(userId, currentSessionId),
      auditService.listAccount(userId, { page: 1, limit: 100 }),
      privacyRepository.githubData(profile.email)
    ]);
    return { ...profile, sessions, auditEvents: accountAudit.events, github: { commits: githubCommits, identityMatch: 'authorEmail exato; associação pode ser incompleta' } };
  },
  async updateProfile(userId, input, requestId) {
    await requirePassword(userId, input.currentPassword);
    const email = input.email.trim().toLowerCase();
    const existing = await privacyRepository.findUserByEmail(email);
    if (existing && existing.id !== userId) throw new AppError({ message: 'Não foi possível atualizar a conta.', statusCode: 409, code: ERROR_CODES.CONFLICT, exposeTechnicalDetails: true });
    return privacyRepository.updateProfile(userId, { name: input.name.trim(), email, emailVerifiedAt: null }, audit(userId, requestId, 'ACCOUNT_PROFILE_UPDATED', 'User', userId));
  },
  async sessions(userId, currentSessionId) {
    const sessions = await privacyRepository.listSessions(userId);
    return sessions.map((session) => ({ ...session, current: session.id === currentSessionId }));
  },
  async revokeSession(userId, sessionId, requestId) {
    const count = await privacyRepository.revokeSession(userId, sessionId, audit(userId, requestId, 'SESSION_REVOKED', 'Session', sessionId, { sessionId }));
    if (!count) throw notFound();
  },
  revokeAllSessions(userId, requestId) {
    return privacyRepository.revokeAllSessions(userId, audit(userId, requestId, 'ALL_SESSIONS_REVOKED', 'Session', userId, { scope: 'all' }));
  },
  async requestExport(userId, requestId) {
    const expiresAt = new Date(Date.now() + env.exportFileTtlMinutes * 60000);
    return privacyRepository.createExport(userId, expiresAt,
      audit(userId, requestId, 'PERSONAL_DATA_EXPORT_REQUESTED', 'PersonalDataExport', null, { format: 'JSON' }),
      audit(userId, requestId, 'PERSONAL_DATA_EXPORT_COMPLETED', 'PersonalDataExport', null, { format: 'JSON' }));
  },
  async exportStatus(userId, exportId) {
    const record = await privacyRepository.findExport(userId, exportId);
    if (!record) throw notFound();
    if (record.expiresAt <= new Date() && record.status === 'COMPLETED') return privacyRepository.expireExport(record.id);
    return record;
  },
  async downloadExport(userId, exportId) {
    const record = await this.exportStatus(userId, exportId);
    if (record.status !== 'COMPLETED') throw new AppError({ message: 'Exportação expirada ou indisponível.', statusCode: 410, code: ERROR_CODES.EXPORT_EXPIRED, exposeTechnicalDetails: true });
    return { generatedAt: new Date().toISOString(), exportId: record.id, data: await this.personalData(userId) };
  },
  async deactivate(userId, password, requestId) {
    await requirePassword(userId, password);
    await ensureNoLastOwner(userId);
    const result = await privacyRepository.deactivate(userId,
      audit(userId, requestId, 'ACCOUNT_DEACTIVATION_REQUESTED', 'PrivacyRequest'),
      audit(userId, requestId, 'ACCOUNT_DEACTIVATED', 'User', userId));
    if (result.lastOwnerProjects) throw new AppError({ message: 'Transfira a propriedade dos projetos antes de continuar.', statusCode: 409, code: ERROR_CODES.LAST_PROJECT_OWNER, details: result.lastOwnerProjects.map((project) => ({ projectId: project.id, name: project.name })), exposeTechnicalDetails: true });
    return result;
  },
  deletionRequest(userId) { return privacyRepository.pendingDeletion(userId); },
  async requestDeletion(userId, password, requestId) {
    await requirePassword(userId, password);
    await ensureNoLastOwner(userId);
    const existing = await privacyRepository.pendingDeletion(userId);
    if (existing) return existing;
    const scheduledFor = new Date(Date.now() + env.accountDeletionGraceDays * 86400000);
    return privacyRepository.requestDeletion(userId, scheduledFor, audit(userId, requestId, 'ACCOUNT_DELETION_REQUESTED', 'PrivacyRequest'));
  },
  async cancelDeletion(userId, requestId) {
    const request = await privacyRepository.cancelDeletion(userId, audit(userId, requestId, 'ACCOUNT_DELETION_CANCELLED', 'PrivacyRequest'));
    if (!request) throw notFound();
    return request;
  },
  async processDueDeletions({ now = new Date(), dryRun = true } = {}) {
    const due = await privacyRepository.dueDeletionRequests(now);
    if (dryRun) return { mode: 'dry-run', count: due.length };
    let processed = 0;
    for (const request of due) {
      if ((await privacyRepository.lastOwnedProjects(request.userId)).length) continue;
      const suffix = randomUUID();
      const result = await privacyRepository.anonymize(request.id, { name: 'Usuário anonimizado', email: `anon-${suffix}@anonymous.invalid` }, buildAuditEvent({ actorUserId: request.userId, actorType: 'SYSTEM', action: 'ACCOUNT_ANONYMIZED', resourceType: 'User', resourceId: request.userId }));
      if (result && !result.blocked) processed += 1;
    }
    return { mode: 'apply', count: due.length, processed };
  }
};
