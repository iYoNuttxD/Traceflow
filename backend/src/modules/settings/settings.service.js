import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { env } from '../../config/env.js';
import { AppError, ERROR_CODES } from '../../shared/errors/index.js';
import { emailService } from '../../shared/email/index.js';
import { authService } from '../auth/auth.service.js';
import {
  normalizeUsername,
  passwordPolicyErrors,
  validateUsername
} from '../auth/identity-policy.js';
import { buildAuditEvent } from '../audit/audit.service.js';
import { githubAppService } from '../github/github-app.service.js';
import { githubAuthService } from '../auth/github-auth.service.js';
import { settingsRepository } from './settings.repository.js';
import { createJsonZip } from './zip.js';

const hashToken = (token) => createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');
const day = 86400000;

function error(message, statusCode, code, details) {
  return new AppError({ message, statusCode, code, details, exposeTechnicalDetails: true });
}

function audit(userId, requestId, action, resourceType = 'User', resourceId = userId, metadata) {
  return buildAuditEvent({
    actorUserId: userId,
    requestId,
    action,
    resourceType,
    resourceId,
    metadata
  });
}

async function requireActive(userId) {
  const user = await settingsRepository.account(userId);
  if (!user || user.accountStatus !== 'ACTIVE') {
    throw error('A conta precisa estar ativa.', 403, ERROR_CODES.ACCOUNT_NOT_ACTIVE);
  }
  return user;
}

async function requirePassword(userId, password) {
  if (
    typeof password !== 'string' ||
    !password ||
    !(await authService.verifyPassword(userId, password))
  ) {
    throw error('Senha atual inválida.', 403, ERROR_CODES.CURRENT_PASSWORD_INVALID);
  }
}

async function requireSensitiveAuthentication(userId, session, currentPassword, now = new Date()) {
  const account = await settingsRepository.account(userId);
  if (!account) throw error('Conta não encontrada.', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
  if (account.passwordHash) {
    await requirePassword(userId, currentPassword);
    return 'LOCAL_PASSWORD';
  }
  const identity = await githubAuthService.identity(userId);
  if (!identity) {
    throw error('Nenhuma conta GitHub vinculada.', 409, ERROR_CODES.GITHUB_IDENTITY_NOT_LINKED);
  }
  const cutoff = now.getTime() - env.githubReauthenticationTtlMs;
  if (
    !session?.lastReauthenticatedAt ||
    session.lastReauthenticatedAt.getTime() < cutoff ||
    !identity.lastAuthenticatedAt ||
    identity.lastAuthenticatedAt.getTime() < cutoff
  ) {
    throw error(
      'Confirme sua identidade com GitHub novamente.',
      403,
      ERROR_CODES.GITHUB_REAUTHENTICATION_REQUIRED
    );
  }
  return 'GITHUB_REAUTHENTICATION';
}

function throwOwnership(blocked) {
  throw error(
    'Você é o único proprietário de projetos ativos.',
    409,
    ERROR_CODES.SOLE_PROJECT_OWNER,
    blocked
  );
}

async function buildExportArchive(userId, now) {
  const account = await settingsRepository.account(userId);
  if (!account || !['ACTIVE', 'DELETION_PENDING'].includes(account.accountStatus)) {
    throw error(
      'Exportação indisponível para o estado atual.',
      403,
      ERROR_CODES.ACCOUNT_NOT_ACTIVE
    );
  }
  const data = await settingsRepository.exportData(userId);
  const projects = data.memberships.map(({ project }) => ({
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  }));
  const requirements = data.memberships.flatMap(({ project }) =>
    project.requirements.map((requirement) => ({ ...requirement, projectId: project.id }))
  );
  const sections = {
    'profile.json': {
      id: data.id,
      name: data.name,
      username: data.username,
      email: data.email,
      accountStatus: data.accountStatus,
      emailVerifiedAt: data.emailVerifiedAt,
      lastLoginAt: data.lastLoginAt,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    },
    'memberships.json': data.memberships.map(({ project, ...membership }) => ({
      ...membership,
      project: { id: project.id, name: project.name, status: project.status }
    })),
    'projects.json': projects,
    'requirements.json': requirements,
    'tasks.json': data.responsibleTasks,
    'sessions.json': data.sessions,
    'privacy-requests.json': data.privacyRequests,
    'data-exports.json': data.personalDataExports || [],
    'email-change-history.json': data.emailChangeRequests || [],
    'audit-events.json': data.auditEvents,
    'github-identity.json': data.githubIdentity || null,
    'github-integrations.json': data.githubInstallationAuthorizations
  };
  const files = Object.keys(sections);
  const manifest = {
    schemaVersion: '2.0',
    generatedAt: now.toISOString(),
    format: 'TRACEFLOW_USER_DATA_EXPORT',
    authorizationScope: 'CURRENT_PROJECT_ACCESS_AND_DATA_SUBJECT',
    files: ['manifest.json', ...files]
  };
  const zip = createJsonZip({ 'manifest.json': manifest, ...sections }, now);
  return { zip, filename: `traceflow-export-${now.toISOString().slice(0, 10)}.zip` };
}

export const settingsService = {
  async account(userId, session) {
    const user = await settingsRepository.account(userId);
    if (!user) throw error('Conta não encontrada.', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    const [pendingEmailChange, githubIdentity] = await Promise.all([
      settingsRepository.pendingEmailChange(userId),
      githubAuthService.identity(userId)
    ]);
    const recentAuthenticationCutoff = Date.now() - env.githubReauthenticationTtlMs;
    const recentlyReauthenticated = Boolean(
      githubIdentity?.lastAuthenticatedAt &&
      githubIdentity.lastAuthenticatedAt.getTime() >= recentAuthenticationCutoff &&
      session?.lastReauthenticatedAt &&
      session.lastReauthenticatedAt.getTime() >= recentAuthenticationCutoff
    );
    const nextUsernameChangeAt = user.usernameChangedAt
      ? new Date(user.usernameChangedAt.getTime() + 30 * day)
      : null;
    const { passwordHash, ...safeUser } = user;
    return {
      ...safeUser,
      hasLocalPassword: Boolean(passwordHash),
      hasGithubIdentity: Boolean(githubIdentity),
      recentlyReauthenticated,
      canInitializePassword: Boolean(!passwordHash && githubIdentity && recentlyReauthenticated),
      pendingEmailChange,
      nextUsernameChangeAt
    };
  },
  async updateProfile(userId, name, requestId) {
    await requireActive(userId);
    return settingsRepository.updateProfile(
      userId,
      name.trim(),
      audit(userId, requestId, 'PROFILE_UPDATED')
    );
  },
  githubIdentity(userId) {
    return githubAuthService.identity(userId);
  },
  async startGithubIdentityLink(userId, session, password) {
    const account = await requireActive(userId);
    return githubAuthService.startLink({
      user: { ...account, hasLocalPassword: Boolean(account.passwordHash) },
      session,
      password
    });
  },
  async unlinkGithubIdentity(userId, currentSessionId, input, requestId, now = new Date()) {
    const user = await requireActive(userId);
    if (!user.passwordHash) {
      throw error(
        'Crie uma senha para sua conta antes de remover seu único método de autenticação.',
        409,
        ERROR_CODES.LOCAL_PASSWORD_REQUIRED
      );
    }
    await requirePassword(userId, input.currentPassword);
    const result = await settingsRepository.unlinkGithubIdentity(
      userId,
      currentSessionId,
      now,
      audit(userId, requestId, 'GITHUB_IDENTITY_UNLINKED', 'GitHubIdentity')
    );
    if (result.status === 'not_linked')
      throw error('Nenhuma conta GitHub vinculada.', 404, ERROR_CODES.GITHUB_IDENTITY_NOT_LINKED);
    return result;
  },
  async initializePassword(userId, currentSessionId, input, requestId, now = new Date()) {
    const user = await requireActive(userId);
    if (user.passwordHash)
      throw error('A senha local já foi cadastrada.', 409, ERROR_CODES.PASSWORD_ALREADY_SET);
    if (input.newPassword !== input.confirmation)
      throw error('As senhas não coincidem.', 400, ERROR_CODES.VALIDATION_ERROR);
    const policyErrors = passwordPolicyErrors(input.newPassword, user);
    if (policyErrors.length) throw error(policyErrors[0], 400, ERROR_CODES.VALIDATION_ERROR);
    const reauthenticatedAfter = new Date(now.getTime() - env.githubReauthenticationTtlMs);
    const result = await settingsRepository.initializePassword(
      userId,
      currentSessionId,
      await authService.hashPassword(input.newPassword),
      reauthenticatedAfter,
      now,
      audit(userId, requestId, 'LOCAL_PASSWORD_INITIALIZED')
    );
    if (result.status === 'already_set')
      throw error('A senha local já foi cadastrada.', 409, ERROR_CODES.PASSWORD_ALREADY_SET);
    if (result.status === 'identity_missing')
      throw error('Nenhuma conta GitHub vinculada.', 409, ERROR_CODES.GITHUB_IDENTITY_NOT_LINKED);
    if (result.status !== 'initialized')
      throw error(
        'Confirme sua identidade com GitHub novamente.',
        403,
        ERROR_CODES.GITHUB_REAUTHENTICATION_REQUIRED
      );
    return result;
  },
  async updateUsername(userId, username, requestId, now = new Date()) {
    const user = await requireActive(userId);
    const result = validateUsername(normalizeUsername(username));
    if (!result.valid) throw error(result.message, 400, ERROR_CODES.VALIDATION_ERROR);
    if (
      !user.mustSetUsername &&
      user.usernameChangedAt &&
      user.usernameChangedAt.getTime() + 30 * day > now.getTime()
    ) {
      throw error(
        'O username só pode ser alterado uma vez a cada 30 dias.',
        409,
        ERROR_CODES.USERNAME_CHANGE_COOLDOWN,
        { nextChangeAt: new Date(user.usernameChangedAt.getTime() + 30 * day) }
      );
    }
    try {
      return await settingsRepository.updateUsername(
        userId,
        result.username,
        now,
        audit(userId, requestId, 'USERNAME_CHANGED')
      );
    } catch (cause) {
      if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002') {
        throw error('Este username não está disponível.', 409, ERROR_CODES.USERNAME_ALREADY_IN_USE);
      }
      throw cause;
    }
  },
  emailChangeStatus(userId) {
    return settingsRepository.pendingEmailChange(userId);
  },
  async requestEmailChange(userId, session, input, requestId, now = new Date()) {
    const user = await requireActive(userId);
    await requireSensitiveAuthentication(userId, session, input.currentPassword, now);
    const newEmail = input.newEmail.trim().toLowerCase();
    if (newEmail === user.email) {
      throw error('O novo e-mail deve ser diferente do atual.', 400, ERROR_CODES.VALIDATION_ERROR);
    }
    if (await settingsRepository.findUserByEmail(newEmail)) {
      throw error('Este e-mail já está em uso.', 409, ERROR_CODES.EMAIL_ALREADY_IN_USE);
    }
    const token = newToken();
    const expiresAt = new Date(now.getTime() + (env.emailChangeTtlMs || 30 * 60 * 1000));
    const request = await settingsRepository.createEmailChange(
      userId,
      {
        currentEmailSnapshot: user.email,
        newEmail,
        tokenHash: hashToken(token),
        expiresAt,
        now
      },
      audit(userId, requestId, 'EMAIL_CHANGE_REQUESTED', 'EmailChangeRequest', null)
    );
    const delivery = await emailService.sendEmailChangeConfirmation({
      to: newEmail,
      token,
      expiresAt,
      userId,
      name: user.name
    });
    return { ...request, deliveryStatus: delivery.status };
  },
  async cancelEmailChange(userId, requestId, now = new Date()) {
    await requireActive(userId);
    return settingsRepository.cancelEmailChange(
      userId,
      now,
      audit(userId, requestId, 'EMAIL_CHANGE_CANCELLED', 'EmailChangeRequest', null)
    );
  },
  async confirmEmailChange(token, requestId, now = new Date()) {
    let result;
    try {
      result = await settingsRepository.confirmEmailChange(
        hashToken(token),
        now,
        audit(null, requestId, 'EMAIL_CHANGED')
      );
    } catch (cause) {
      if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002') {
        throw error('Este e-mail já está em uso.', 409, ERROR_CODES.EMAIL_ALREADY_IN_USE);
      }
      throw cause;
    }
    if (result.outcome === 'expired') {
      throw error(
        'Token de alteração de e-mail expirado.',
        400,
        ERROR_CODES.EMAIL_CHANGE_TOKEN_EXPIRED
      );
    }
    if (result.outcome !== 'confirmed') {
      throw error(
        'Token de alteração de e-mail inválido.',
        400,
        ERROR_CODES.EMAIL_CHANGE_TOKEN_INVALID
      );
    }
    await emailService.sendEmailChangedNotice({
      to: result.previousEmail,
      userId: result.user.id,
      name: result.user.name
    });
    return result.user;
  },
  async changePassword(userId, sessionId, input, requestId, now = new Date()) {
    const user = await requireActive(userId);
    await requirePassword(userId, input.currentPassword);
    if (input.newPassword !== input.confirmation) {
      throw error('A confirmação da nova senha não confere.', 400, ERROR_CODES.VALIDATION_ERROR);
    }
    const policyErrors = passwordPolicyErrors(input.newPassword, user);
    if (policyErrors.length) throw error(policyErrors[0], 400, ERROR_CODES.VALIDATION_ERROR);
    await settingsRepository.changePassword(
      userId,
      sessionId,
      await authService.hashPassword(input.newPassword),
      now,
      audit(userId, requestId, 'PASSWORD_CHANGED')
    );
    await emailService.sendPasswordChangedNotice({ to: user.email, userId, name: user.name });
  },
  async sessions(userId, currentPublicId) {
    return (await settingsRepository.listSessions(userId)).map((session) => ({
      sessionId: session.publicId,
      rememberMe: session.rememberMe,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      current: session.publicId === currentPublicId
    }));
  },
  async revokeSession(userId, publicId, requestId, now = new Date()) {
    const session = await settingsRepository.revokeSession(
      userId,
      publicId,
      now,
      audit(userId, requestId, 'SESSION_REVOKED', 'Session', publicId)
    );
    if (!session) throw error('Sessão não encontrada.', 404, ERROR_CODES.SESSION_NOT_FOUND);
    return session;
  },
  revokeOtherSessions(userId, currentSessionId, requestId, now = new Date()) {
    return settingsRepository.revokeOtherSessions(
      userId,
      currentSessionId,
      now,
      audit(userId, requestId, 'OTHER_SESSIONS_REVOKED', 'Session', null)
    );
  },
  async deactivate(userId, currentSession, input, requestId, now = new Date()) {
    await requireActive(userId);
    await requireSensitiveAuthentication(userId, currentSession, input.currentPassword, now);
    const result = await settingsRepository.deactivate(
      userId,
      currentSession.id,
      now,
      audit(userId, requestId, 'ACCOUNT_DEACTIVATED')
    );
    if (result.blocked) throwOwnership(result.blocked);
    await emailService.sendAccountDeactivatedNotice({
      to: result.user.email,
      userId,
      name: result.user.name
    });
    return result.user;
  },
  async startReactivation(userId, requestId, now = new Date()) {
    const user = await settingsRepository.account(userId);
    if (!user || user.accountStatus !== 'DEACTIVATED') {
      throw error('Conta não está desativada.', 409, ERROR_CODES.ACCOUNT_NOT_ACTIVE);
    }
    const token = newToken();
    const expiresAt = new Date(now.getTime() + (env.accountReactivationTtlMs || 30 * 60 * 1000));
    await settingsRepository.createReactivationToken(
      userId,
      hashToken(token),
      expiresAt,
      now,
      audit(userId, requestId, 'ACCOUNT_REACTIVATION_REQUESTED', 'AccountReactivationToken', null)
    );
    return emailService.sendAccountReactivation({
      to: user.email,
      token,
      expiresAt,
      userId,
      name: user.name
    });
  },
  async confirmReactivation(token, requestId, now = new Date()) {
    const user = await settingsRepository.confirmReactivation(
      hashToken(token),
      now,
      audit(null, requestId, 'ACCOUNT_REACTIVATED')
    );
    if (!user)
      throw error(
        'Token de reativação inválido ou expirado.',
        400,
        ERROR_CODES.INVALID_CREDENTIALS
      );
    return user;
  },
  deletion(userId) {
    return settingsRepository.pendingDeletion(userId);
  },
  async requestDeletion(userId, session, input, requestId, now = new Date()) {
    await requireActive(userId);
    await requireSensitiveAuthentication(userId, session, input.currentPassword, now);
    const scheduledFor = new Date(now.getTime() + (env.accountDeletionGraceDays || 30) * day);
    const result = await settingsRepository.requestDeletion(
      userId,
      session.id,
      now,
      scheduledFor,
      audit(userId, requestId, 'ACCOUNT_DELETION_REQUESTED', 'PrivacyRequest', null)
    );
    const user = await settingsRepository.account(userId);
    await emailService.sendAccountDeletionRequested({
      to: user.email,
      scheduledFor,
      userId,
      name: user.name
    });
    return result.request;
  },
  async cancelDeletion(userId, session, input, requestId, now = new Date()) {
    await requireSensitiveAuthentication(userId, session, input.currentPassword, now);
    const result = await settingsRepository.cancelDeletion(
      userId,
      now,
      audit(userId, requestId, 'ACCOUNT_DELETION_CANCELLED', 'PrivacyRequest', null)
    );
    if (!result) {
      throw error(
        'A exclusão não pode ser cancelada.',
        409,
        ERROR_CODES.DELETION_CANNOT_BE_CANCELLED
      );
    }
    if (result.changed) {
      const user = await settingsRepository.account(userId);
      await emailService.sendAccountDeletionCancelled({ to: user.email, userId, name: user.name });
    }
    return result;
  },
  buildExportArchive(userId, now = new Date()) {
    return buildExportArchive(userId, now);
  },
  async exportData(userId, requestId, now = new Date()) {
    const archive = await buildExportArchive(userId, now);
    const expiresAt = new Date(now.getTime() + (env.exportFileTtlMinutes || 15) * 60000);
    const record = await settingsRepository.recordExport(
      userId,
      now,
      expiresAt,
      audit(userId, requestId, 'USER_DATA_EXPORTED', 'PersonalDataExport', null, {
        format: 'ZIP_JSON'
      })
    );
    return { ...archive, record };
  },
  async githubIntegrations(userId) {
    const authorizations = await settingsRepository.listGithubAuthorizations(userId);
    return Promise.all(
      authorizations.map(async (authorization) => {
        const installation = authorization.installation;
        const repositoryDiscovery =
          installation.status === 'ACTIVE'
            ? await githubAppService.listRepositories(userId, installation.githubInstallationId)
            : { repositories: [] };
        return {
          id: authorization.id,
          verifiedAt: authorization.verifiedAt,
          createdAt: authorization.createdAt,
          installation: {
            githubInstallationId: installation.githubInstallationId,
            accountLogin: installation.accountLogin,
            accountType: installation.accountType,
            status: installation.status,
            installedAt: installation.installedAt,
            manageUrl: `https://github.com/settings/installations/${installation.githubInstallationId}`
          },
          repositories: repositoryDiscovery.repositories,
          projects: installation.projectIntegrations.map((integration) => ({
            id: integration.project.id,
            name: integration.project.name,
            repositoryFullName: integration.repositoryFullName,
            status: integration.status
          }))
        };
      })
    );
  },
  async removeGithubAuthorization(
    userId,
    session,
    authorizationId,
    input,
    requestId,
    now = new Date()
  ) {
    await requireActive(userId);
    await requireSensitiveAuthentication(userId, session, input.currentPassword, now);
    const result = await settingsRepository.removeGithubAuthorization(
      userId,
      authorizationId,
      now,
      audit(
        userId,
        requestId,
        'GITHUB_APP_CONNECTION_REMOVED',
        'GitHubInstallationAuthorization',
        authorizationId
      )
    );
    if (!result) {
      throw error(
        'Autorização GitHub não encontrada.',
        404,
        ERROR_CODES.GITHUB_AUTHORIZATION_NOT_FOUND
      );
    }
    return result;
  }
};
