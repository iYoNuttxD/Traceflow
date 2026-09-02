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
export const GITHUB_WEBHOOK_STALE_AFTER_MS = 5 * 60 * 1000;
const forbidden = (
  message = 'Instalação GitHub não autorizada.',
  githubCallbackFailureCode = 'FORBIDDEN'
) => {
  const error = new AppError({
    message,
    statusCode: 403,
    code: ERROR_CODES.FORBIDDEN,
    exposeTechnicalDetails: true
  });
  error.githubCallbackFailureCode = githubCallbackFailureCode;
  return error;
};
const repositoryConflict = (connectedProject) =>
  new AppError({
    message: 'Este repositório GitHub já está conectado a outro projeto.',
    statusCode: 409,
    code: ERROR_CODES.CONFLICT,
    details: connectedProject ? { connectedProject } : undefined,
    exposeTechnicalDetails: true
  });
const repositorySwapConflict = () =>
  new AppError({
    message:
      'Este projeto já está vinculado a outro repositório GitHub. Crie outro projeto para preservar a rastreabilidade.',
    statusCode: 409,
    code: ERROR_CODES.GITHUB_REPOSITORY_SWAP_FORBIDDEN,
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
  const currentIntegration = projectId
    ? await githubRepository.findIntegration(Number(projectId))
    : null;
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
    const preservesCurrentRepository =
      !currentIntegration?.githubRepositoryId ||
      String(currentIntegration.githubRepositoryId) === String(repository.githubRepositoryId);
    return {
      ...repository,
      availability: integration ? 'CONNECTED' : 'AVAILABLE',
      alreadyConnected: Boolean(integration),
      connectedToCurrentProject,
      selectable: (!integration || connectedToCurrentProject) && preservesCurrentRepository,
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

function assertValidStateRecord(record, now) {
  if (!record || record.usedAt || record.expiresAt <= now) {
    throw forbidden(
      'Estado da conexão GitHub inválido, expirado ou já utilizado.',
      'INVALID_STATE'
    );
  }
  if (
    !record.user?.isActive ||
    record.user.id !== record.userId ||
    record.user.accountStatus !== 'ACTIVE'
  ) {
    throw forbidden('A conta precisa estar ativa.', 'ACCOUNT_NOT_ACTIVE');
  }
  if (
    !record.session ||
    record.session.userId !== record.userId ||
    record.session.revokedAt ||
    record.session.expiresAt <= now ||
    record.session.sessionVersion !== record.user.sessionVersion
  ) {
    throw forbidden('Sessão do fluxo GitHub inválida.', 'INVALID_SESSION');
  }
  const intendedActionValid =
    (record.intendedAction === 'CONNECT_PROJECT' && Boolean(record.projectId)) ||
    (record.intendedAction === 'CREATE_PROJECT' && !record.projectId);
  if (!intendedActionValid) {
    throw forbidden('Intenção da conexão GitHub inválida.', 'INVALID_STATE');
  }
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
        throw forbidden('Callback da GitHub App inválido.', 'INVALID_STATE');
      const now = new Date();
      const record = await githubRepository.findConnectionState(hashToken(state));
      assertValidStateRecord(record, now);

      logStep('exchange_installation_user_code');
      const userToken = await githubAppCredentialProvider.exchangeInstallationUserCode(code);

      logStep('validate_installation');
      const installations =
        await githubAppCredentialProvider.listInstallationsAccessibleToUser(userToken);
      const userInstallation = installations.find(
        (item) => item.githubInstallationId === String(installationId)
      );
      if (!userInstallation) {
        throw forbidden(
          'A instalação informada não está acessível ao usuário que concluiu o fluxo.',
          'INSTALLATION_NOT_ACCESSIBLE'
        );
      }

      logStep('fetch_installation');
      const metadata = await githubAppCredentialProvider.getInstallation(installationId);
      if (
        metadata.githubInstallationId !== String(installationId) ||
        metadata.accountId !== userInstallation.accountId
      ) {
        throw forbidden(
          'A instalação GitHub não corresponde ao contexto validado.',
          'INSTALLATION_NOT_FOUND'
        );
      }

      logStep('verify_repository_access');
      const installationClient =
        await githubInstallationClientFactory.forInstallation(installationId);
      await installationClient.verifyRepositoryAccess();

      logStep('persist_installation');
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
      if (authorizationResult.lifecycleBlocked) {
        throw forbidden(
          `A instalação GitHub está ${authorizationResult.lifecycleBlocked.toLowerCase()} e não pode ser reativada pelo callback.`,
          `INSTALLATION_${authorizationResult.lifecycleBlocked}`
        );
      }
      const { installation } = authorizationResult;
      logStep('consume_state');
      logStep('complete');
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
        errorCode:
          error.githubCallbackFailureCode ||
          (error.callbackStep ? 'PERSISTENCE_FAILURE' : error.code || 'GITHUB_API_FAILURE')
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
    return {
      repositories: await addRepositoryAvailability(repositories, userId, projectId)
    };
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
    return {
      repositories: await addRepositoryAvailability(repositories, userId, projectId)
    };
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
        message: 'Repositório inacessível pela instalação GitHub App.',
        statusCode: 404,
        code: ERROR_CODES.RESOURCE_NOT_FOUND,
        exposeTechnicalDetails: true
      });
    return { installation, repository };
  },
  async connectProject({ projectId, userId, githubInstallationId, githubRepositoryId }) {
    await requireOwner(projectId, userId);
    const currentIntegration = await githubRepository.findIntegration(Number(projectId));
    if (
      currentIntegration?.githubRepositoryId &&
      String(currentIntegration.githubRepositoryId) !== String(githubRepositoryId)
    ) {
      throw repositorySwapConflict();
    }
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
      if (error?.code === 'GITHUB_REPOSITORY_SWAP_FORBIDDEN') throw repositorySwapConflict();
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
    if (!this.verifyWebhookSignature(rawBody, signature)) {
      logger.warn('Webhook GitHub rejeitado por assinatura inválida.', {
        event: 'github_webhook_signature_invalid'
      });
      throw forbidden('Assinatura do webhook GitHub inválida.');
    }
    if (
      typeof deliveryId !== 'string' ||
      deliveryId.length < 1 ||
      deliveryId.length > 128 ||
      typeof event !== 'string' ||
      !/^[a-z_]{1,64}$/.test(event)
    )
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
    const now = new Date();
    const started = await githubRepository.startWebhookDelivery(
      {
        deliveryId,
        event,
        action: payload.action || null,
        installationId: payload.installation?.id ? String(payload.installation.id) : null
      },
      now,
      new Date(now.getTime() - GITHUB_WEBHOOK_STALE_AFTER_MS)
    );
    if (started.duplicate) return { duplicate: true };

    const delivery = started.delivery;
    const installationId = payload.installation?.id;
    let processingStep = 'dispatch_event';
    try {
      if (
        event === 'installation_repositories' &&
        installationId &&
        ['added', 'removed'].includes(payload.action)
      ) {
        processingStep = 'refresh_installation_metadata';
        await githubRepository.refreshInstallationMetadata(installationId, payload.installation);
      }
      if (event === 'installation' && installationId) {
        if (payload.action === 'created') {
          processingStep = 'create_pending_installation';
          await githubRepository.upsertInstallationFromWebhook(
            installationId,
            payload.installation
          );
        } else if (payload.action === 'suspend') {
          processingStep = 'suspend_installation';
          await githubRepository.updateInstallationStatus(installationId, 'SUSPENDED', now);
          await githubRepository.requireReconnectForInstallation(installationId);
        } else if (payload.action === 'deleted') {
          processingStep = 'remove_installation';
          await githubRepository.updateInstallationStatus(installationId, 'REMOVED');
          await githubRepository.requireReconnectForInstallation(installationId);
        } else if (payload.action === 'unsuspend') {
          processingStep = 'unsuspend_installation';
          await githubRepository.updateInstallationStatus(installationId, 'ACTIVE', null);
        }
      }
      if (event === 'installation_repositories' && payload.action === 'removed' && installationId) {
        const repositoryIds = (payload.repositories_removed || []).map((item) => item.id);
        processingStep = 'remove_repository_access';
        await githubRepository.requireReconnectForRepositories(installationId, repositoryIds);
      }
      processingStep = 'complete_delivery';
      await githubRepository.completeWebhookDelivery(delivery.id);
      return { duplicate: false };
    } catch (error) {
      const rawFailureCode = String(error.code || '');
      const failureCode = /^[A-Z0-9_]{1,191}$/.test(rawFailureCode)
        ? rawFailureCode
        : 'GITHUB_WEBHOOK_PROCESSING_FAILED';
      await githubRepository.failWebhookDelivery(
        delivery.id,
        processingStep,
        failureCode,
        new Date()
      );
      logger.warn('Processamento do webhook GitHub falhou e poderá ser retomado.', {
        event: 'github_webhook_processing_failed',
        deliveryId,
        step: processingStep,
        errorCode: failureCode
      });
      throw error;
    }
  }
};
