import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { AppError, ERROR_CODES } from '../../shared/errors/index.js';
import { logger } from '../../shared/logger/index.js';
import { authorizationService } from '../authorization/authorization.service.js';
import { githubAppCredentialProvider } from './github-credential.provider.js';
import { githubInstallationClientFactory } from './github.client.js';
import { collectGithubPages } from './github-pagination.js';
import { githubRepository } from './github.repository.js';

const hashToken = (value) => createHash('sha256').update(value).digest('hex');
const forbidden = (message = 'Instalação GitHub não autorizada.') =>
  new AppError({
    message,
    statusCode: 403,
    code: ERROR_CODES.FORBIDDEN,
    exposeTechnicalDetails: true
  });
const repositoryConflict = (connectedProject) =>
  new AppError({
    message: 'Este repositório GitHub já está conectado a outro projeto.',
    statusCode: 409,
    code: ERROR_CODES.CONFLICT,
    details: connectedProject ? { connectedProject } : undefined,
    exposeTechnicalDetails: true
  });

async function requireOwner(projectId, userId) {
  const membership = await authorizationService.membership(Number(projectId), userId);
  if (!membership || membership.role !== 'OWNER')
    throw forbidden('Somente OWNER pode alterar a integração GitHub.');
}

function installationDto(item) {
  return {
    id: item.id,
    githubInstallationId: item.githubInstallationId,
    accountLogin: item.accountLogin,
    accountType: item.accountType,
    status: item.status
  };
}

async function addRepositoryAvailability(repositories, userId, projectId) {
  const integrations = await githubRepository.findIntegrationsByRepositoryIds(
    repositories.map((repository) => repository.githubRepositoryId),
    userId
  );
  const integrationByRepositoryId = new Map(
    integrations.map((integration) => [String(integration.githubRepositoryId), integration])
  );
  return repositories.map((repository) => {
    const integration = integrationByRepositoryId.get(String(repository.githubRepositoryId));
    const connectedToCurrentProject = Boolean(
      integration && projectId && integration.projectId === Number(projectId)
    );
    const canViewConnectedProject = Boolean(integration?.project?.memberships?.length);
    return {
      ...repository,
      availability: integration ? 'CONNECTED' : 'AVAILABLE',
      alreadyConnected: Boolean(integration),
      connectedToCurrentProject,
      selectable: true,
      connectedProject: canViewConnectedProject
        ? { id: integration.project.id, name: integration.project.name }
        : null
    };
  });
}

function validCallbackInput({ code, installationId, setupAction, state }) {
  return (
    typeof code === 'string' &&
    code.length > 0 &&
    code.length <= 512 &&
    typeof installationId === 'string' &&
    /^\d+$/.test(installationId) &&
    typeof state === 'string' &&
    state.length >= 32 &&
    state.length <= 128 &&
    (!setupAction || ['install', 'update'].includes(setupAction))
  );
}

function validStateRecord(record, now) {
  if (!record || record.usedAt || record.expiresAt <= now) return false;
  if (!record.user?.isActive || !record.session || record.session.userId !== record.userId)
    return false;
  if (
    record.session.revokedAt ||
    record.session.expiresAt <= now ||
    record.session.sessionVersion !== record.user.sessionVersion
  )
    return false;
  if (record.intendedAction === 'CONNECT_PROJECT') return Boolean(record.projectId);
  return record.intendedAction === 'CREATE_PROJECT' && !record.projectId;
}

export const githubAppService = {
  async startInstallation({ user, session, intendedAction, projectId }) {
    if (!env.githubAppConfigured)
      throw new AppError({
        message: 'GitHub App não configurada.',
        statusCode: 503,
        code: ERROR_CODES.CONFIGURATION_ERROR,
        exposeTechnicalDetails: true
      });
    if (projectId) await requireOwner(projectId, user.id);
    const state = randomBytes(32).toString('base64url');
    await githubRepository.createConnectionState({
      userId: user.id,
      sessionId: session.id,
      tokenHash: hashToken(state),
      intendedAction,
      projectId: projectId ? Number(projectId) : null,
      expiresAt: new Date(Date.now() + env.githubAppStateTtlMs)
    });
    const url = new URL(
      `https://github.com/apps/${encodeURIComponent(env.githubAppSlug)}/installations/new`
    );
    url.searchParams.set('state', state);
    return { url: url.toString(), expiresInMs: env.githubAppStateTtlMs };
  },
  async completeCallback({ code, installationId, setupAction, state }) {
    let callbackStep = 'validate_state';
    const logStep = (step) => {
      callbackStep = step;
      logger.info('Etapa do callback da GitHub App iniciada.', {
        event: 'github_app_callback_step',
        step
      });
    };
    try {
      logStep('validate_state');
      if (!validCallbackInput({ code, installationId, setupAction, state }))
        throw forbidden('Callback da GitHub App inválido.');
      const now = new Date();
      const record = await githubRepository.findConnectionState(hashToken(state));
      if (!validStateRecord(record, now)) {
        throw forbidden('Estado da conexão GitHub inválido, expirado ou já utilizado.');
      }

      logStep('exchange_code');
      const userToken = await githubAppCredentialProvider.exchangeInstallationUserCode(code);

      logStep('list_user_installations');
      const installations =
        await githubAppCredentialProvider.listInstallationsAccessibleToUser(userToken);

      logStep('validate_installation');
      const metadata = installations.find(
        (item) => item.githubInstallationId === String(installationId)
      );
      if (!metadata)
        throw forbidden('A instalação informada não está acessível ao usuário autorizado.');

      logStep('upsert_installation');
      const authorizationResult = await githubRepository.authorizeInstallationFromState({
        stateId: record.id,
        now,
        userId: record.userId,
        installation: {
          githubInstallationId: metadata.githubInstallationId,
          accountId: metadata.accountId,
          accountLogin: metadata.accountLogin,
          accountType: metadata.accountType,
          installedAt: metadata.installedAt
        }
      });
      if (!authorizationResult)
        throw forbidden('Estado da conexão GitHub inválido, expirado ou já utilizado.');
      const { installation } = authorizationResult;
      logStep('upsert_authorization');
      logStep('consume_state');
      return {
        installation: installationDto(installation),
        userId: record.userId,
        intendedAction: record.intendedAction,
        projectId: record.projectId
      };
    } catch (error) {
      logger.warn('Callback da GitHub App interrompido.', {
        event: 'github_app_callback_failed',
        step: error.callbackStep || callbackStep,
        errorCode: error.code || ERROR_CODES.INTERNAL_ERROR
      });
      throw error;
    }
  },
  async listInstallations(userId) {
    return (await githubRepository.listAuthorizedInstallations(userId)).map(installationDto);
  },
  async listRepositories(userId, githubInstallationId, projectId) {
    if (projectId) await requireOwner(projectId, userId);
    const installation = await githubRepository.findAuthorizedInstallation(
      userId,
      githubInstallationId
    );
    if (!installation) throw forbidden();
    const client = await githubInstallationClientFactory.forInstallation(
      installation.githubInstallationId
    );
    const repositories = await collectGithubPages(client.listRepositoryPages());
    return addRepositoryAvailability(repositories, userId, projectId);
  },
  async listAllRepositories(userId, projectId) {
    if (projectId) await requireOwner(projectId, userId);
    const installations = await githubRepository.listAuthorizedInstallations(userId);
    const repositoriesById = new Map();

    for (const installation of installations) {
      const client = await githubInstallationClientFactory.forInstallation(
        installation.githubInstallationId
      );
      const repositories = await collectGithubPages(client.listRepositoryPages());
      for (const repository of repositories) {
        if (!repositoriesById.has(repository.githubRepositoryId)) {
          repositoriesById.set(repository.githubRepositoryId, {
            ...repository,
            githubInstallationId: installation.githubInstallationId,
            accountLogin: installation.accountLogin
          });
        }
      }
    }

    const repositories = [...repositoriesById.values()].sort((first, second) =>
      first.fullName.localeCompare(second.fullName)
    );
    return addRepositoryAvailability(repositories, userId, projectId);
  },
  async assertRepositoryAvailable(githubRepositoryId, projectId, userId) {
    const integration = await githubRepository.findIntegrationByRepositoryId(
      githubRepositoryId,
      userId
    );
    if (integration && integration.projectId !== Number(projectId)) {
      const connectedProject = integration.project?.memberships?.length
        ? { id: integration.project.id, name: integration.project.name }
        : null;
      throw repositoryConflict(connectedProject);
    }
    return integration;
  },
  async resolveAuthorizedRepository(userId, githubInstallationId, githubRepositoryId) {
    const installation = await githubRepository.findAuthorizedInstallation(
      userId,
      githubInstallationId
    );
    if (!installation) throw forbidden();
    const client = await githubInstallationClientFactory.forInstallation(
      installation.githubInstallationId
    );
    const repositories = await collectGithubPages(client.listRepositoryPages());
    const repository = repositories.find(
      (item) => item.githubRepositoryId === String(githubRepositoryId)
    );
    if (!repository)
      throw new AppError({
        message: 'Repositório não acessível pela instalação.',
        statusCode: 404,
        code: ERROR_CODES.RESOURCE_NOT_FOUND,
        exposeTechnicalDetails: true
      });
    return { installation, repository };
  },
  async connectProject({ projectId, userId, githubInstallationId, githubRepositoryId }) {
    await requireOwner(projectId, userId);
    const { installation, repository } = await this.resolveAuthorizedRepository(
      userId,
      githubInstallationId,
      githubRepositoryId
    );
    await this.assertRepositoryAvailable(repository.githubRepositoryId, projectId, userId);
    try {
      return await githubRepository.connectProject(Number(projectId), installation.id, {
        githubRepositoryId: repository.githubRepositoryId,
        repositoryName: repository.name,
        repositoryFullName: repository.fullName,
        repositoryUrl: repository.url,
        defaultBranch: repository.defaultBranch,
        repositoryPrivate: repository.private
      });
    } catch (error) {
      if (error?.code === 'P2002') throw repositoryConflict();
      throw error;
    }
  },
  verifyWebhookSignature(rawBody, suppliedSignature) {
    if (
      !env.githubAppConfigured ||
      !Buffer.isBuffer(rawBody) ||
      !suppliedSignature?.startsWith('sha256=')
    )
      return false;
    const expected = Buffer.from(
      `sha256=${createHmac('sha256', env.githubAppWebhookSecret).update(rawBody).digest('hex')}`
    );
    const actual = Buffer.from(suppliedSignature);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  },
  async processWebhook({ rawBody, signature, deliveryId, event }) {
    if (!this.verifyWebhookSignature(rawBody, signature))
      throw forbidden('Assinatura do webhook GitHub inválida.');
    if (!deliveryId || !event)
      throw new AppError({
        message: 'Headers obrigatórios do webhook ausentes.',
        statusCode: 400,
        code: ERROR_CODES.VALIDATION_ERROR,
        exposeTechnicalDetails: true
      });
    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new AppError({
        message: 'Payload GitHub inválido.',
        statusCode: 400,
        code: ERROR_CODES.VALIDATION_ERROR,
        exposeTechnicalDetails: true
      });
    }
    let delivery;
    try {
      delivery = await githubRepository.createWebhookDelivery({
        deliveryId,
        event,
        action: payload.action || null,
        installationId: payload.installation?.id ? String(payload.installation.id) : null
      });
    } catch (error) {
      if (error?.code === 'P2002') return { duplicate: true };
      throw error;
    }
    const installationId = payload.installation?.id;
    if (
      event === 'installation_repositories' &&
      installationId &&
      ['added', 'removed'].includes(payload.action)
    ) {
      await githubRepository.refreshInstallationMetadata(installationId, payload.installation);
    }
    if (event === 'installation' && installationId) {
      if (payload.action === 'created') {
        await githubRepository.upsertInstallationFromWebhook(installationId, payload.installation);
      } else if (payload.action === 'suspend') {
        await githubRepository.updateInstallationStatus(installationId, 'SUSPENDED', new Date());
        await githubRepository.requireReconnectForInstallation(installationId);
      } else if (payload.action === 'deleted') {
        await githubRepository.updateInstallationStatus(installationId, 'DELETED');
        await githubRepository.requireReconnectForInstallation(installationId);
      } else if (payload.action === 'unsuspend') {
        await githubRepository.updateInstallationStatus(installationId, 'ACTIVE', null);
      }
    }
    if (event === 'installation_repositories' && payload.action === 'removed' && installationId) {
      await githubRepository.requireReconnectForRepositories(
        installationId,
        (payload.repositories_removed || []).map((item) => item.id)
      );
    }
    await githubRepository.completeWebhookDelivery(delivery.id);
    return { duplicate: false };
  }
};
