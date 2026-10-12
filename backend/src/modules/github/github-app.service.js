import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import {
  AppError,
  ERROR_CODES,
  ExternalServiceError,
  resourceNotFoundError
} from '../../shared/errors/index.js';
import { logger } from '../../shared/logger/index.js';
import { authorizationService } from '../authorization/authorization.service.js';
import { githubAppCredentialProvider } from './github-credential.provider.js';
import { githubInstallationClientFactory } from './github.client.js';
import { collectGithubPages } from './github-pagination.js';
import { githubRepository } from './github.repository.js';
import { buildAuditEvent } from '../audit/audit.service.js';
import { projectRepository } from '../projects/project.repository.js';
import { githubSyncService } from './githubSync.service.js';

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
const pendingRepositoryConflict = (project) =>
  new AppError({
    message: project
      ? 'Este repositório pertence a um projeto programado para exclusão.'
      : 'Este repositório já está associado a um projeto indisponível no TraceFlow. Entre em contato com um responsável pelo projeto.',
    statusCode: 409,
    code: project
      ? ERROR_CODES.PROJECT_PENDING_DELETION
      : ERROR_CODES.PROJECT_REPOSITORY_UNAVAILABLE,
    details: project ? { pendingProject: project } : undefined,
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
const alreadyConnected = () =>
  new AppError({
    message: 'Este projeto já possui uma integração GitHub. Use a sincronização existente.',
    statusCode: 409,
    code: ERROR_CODES.GITHUB_PROJECT_ALREADY_CONNECTED,
    exposeTechnicalDetails: true
  });

function connectionProviderError(error) {
  if (!(error instanceof ExternalServiceError)) return error;
  const publicErrors = {
    [ERROR_CODES.GITHUB_AUTH_FAILED]: [403, 'A GitHub App não possui acesso ao repositório.'],
    [ERROR_CODES.RESOURCE_NOT_FOUND]: [404, 'Repositório GitHub não encontrado ou inacessível.'],
    [ERROR_CODES.GITHUB_RATE_LIMITED]: [429, 'Limite de requisições do GitHub atingido.']
  };
  const [statusCode, message] = publicErrors[error.code] || [
    503,
    'GitHub temporariamente indisponível. Tente vincular o repositório novamente.'
  ];
  return new AppError({
    message,
    statusCode,
    code: statusCode === 503 ? ERROR_CODES.EXTERNAL_SERVICE_ERROR : error.code,
    exposeTechnicalDetails: true,
    cause: error
  });
}

async function requireOwner(projectId, userId) {
  const membership = await authorizationService.membership(Number(projectId), userId);
  if (!membership) throw resourceNotFoundError('Project');
  if (membership.role !== 'OWNER')
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
    const pendingDeletion = Boolean(integration?.project?.deletedAt);
    const ownerMembership = integration?.project?.memberships?.find(
      (membership) => membership.role === 'OWNER'
    );
    const connectedToCurrentProject = Boolean(
      integration && projectId && integration.projectId === Number(projectId)
    );
    const canViewConnectedProject = Boolean(integration?.project?.memberships?.length);
    const preservesCurrentRepository =
      !currentIntegration?.githubRepositoryId ||
      String(currentIntegration.githubRepositoryId) === String(repository.githubRepositoryId);
    return {
      ...repository,
      availability: pendingDeletion ? 'PENDING_DELETION' : integration ? 'CONNECTED' : 'AVAILABLE',
      alreadyConnected: Boolean(integration),
      connectedToCurrentProject,
      selectable:
        ((!integration || connectedToCurrentProject) && preservesCurrentRepository) ||
        (pendingDeletion && Boolean(ownerMembership)),
      pendingDeletion: pendingDeletion
        ? ownerMembership
          ? {
              projectId: integration.project.id,
              projectName: integration.project.name,
              deletionScheduledFor: integration.project.deletionScheduledFor
            }
          : { restricted: true }
        : null,
      connectedProject:
        canViewConnectedProject && !pendingDeletion
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
      if (integration.project?.deletedAt) {
        const owner = integration.project.memberships?.some(
          (membership) => membership.role === 'OWNER'
        );
        throw pendingRepositoryConflict(
          owner
            ? {
                projectId: integration.project.id,
                projectName: integration.project.name,
                deletionScheduledFor: integration.project.deletionScheduledFor,
                repositoryIdentifier: integration.githubRepositoryId
              }
            : null
        );
      }
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
  async connectProject({ projectId, userId, githubInstallationId, githubRepositoryId, requestId }) {
    await requireOwner(projectId, userId);
    const currentIntegration = await githubRepository.findIntegration(Number(projectId));
    if (
      currentIntegration?.githubRepositoryId &&
      String(currentIntegration.githubRepositoryId) !== String(githubRepositoryId)
    ) {
      throw repositorySwapConflict();
    }
    if (currentIntegration && currentIntegration.status !== 'RECONNECT_REQUIRED') {
      throw alreadyConnected();
    }
    const { installation, repository } = await this.resolveAuthorizedRepository(
      userId,
      githubInstallationId,
      githubRepositoryId
    ).catch((error) => {
      throw connectionProviderError(error);
    });
    if (
      currentIntegration &&
      !currentIntegration.githubRepositoryId &&
      currentIntegration.repositoryFullName !== repository.fullName
    ) {
      throw repositorySwapConflict();
    }
    await this.assertRepositoryAvailable(repository.githubRepositoryId, projectId, userId);
    let result;
    try {
      result = await githubRepository.connectProject(
        Number(projectId),
        installation.id,
        {
          githubRepositoryId: repository.githubRepositoryId,
          repositoryName: repository.name,
          repositoryFullName: repository.fullName,
          repositoryUrl: repository.url,
          defaultBranch: repository.defaultBranch,
          repositoryPrivate: repository.private
        },
        {
          userId,
          auditData: buildAuditEvent({
            actorUserId: userId,
            projectId: Number(projectId),
            requestId,
            action: 'GITHUB_PROJECT_CONNECTED',
            resourceType: 'ProjectGitHubIntegration',
            metadata: { githubRepositoryId: repository.githubRepositoryId }
          })
        }
      );
    } catch (error) {
      if (error?.code === 'GITHUB_REPOSITORY_SWAP_FORBIDDEN') throw repositorySwapConflict();
      if (error?.code === 'P2002') {
        await this.assertRepositoryAvailable(repository.githubRepositoryId, projectId, userId);
        throw repositoryConflict();
      }
      if (error?.code === 'P2034') throw repositoryConflict();
      throw error;
    }
    if (result.outcome === 'NOT_FOUND') throw resourceNotFoundError('Project');
    if (result.outcome === 'FORBIDDEN')
      throw forbidden('Somente OWNER pode alterar a integração GitHub.');
    if (result.outcome === 'INSTALLATION_FORBIDDEN') throw forbidden();
    if (result.outcome === 'ALREADY_CONNECTED') throw alreadyConnected();

    let initialSync = null;
    if (result.outcome === 'CONNECTED') {
      // The integration and its audit have committed. A later sync failure must never
      // be reported as a failed connection or encourage another integration write.
      try {
        const run = await githubSyncService.requestProjectGithubSync(Number(projectId), userId);
        initialSync = { status: run.status, run, error: run.error };
      } catch {
        const error = {
          code: 'GITHUB_INITIAL_SYNC_FAILED',
          message:
            'Repositório vinculado. Não foi possível iniciar a sincronização; solicite uma nova sincronização.'
        };
        initialSync = { status: 'FAILED', run: null, error };
        const attemptedAt = new Date();
        try {
          await projectRepository.markGithubSyncFailed(
            Number(projectId),
            attemptedAt,
            error.message
          );
          Object.assign(result.integration, {
            lastSyncStatus: 'FALHA',
            lastSyncError: error.message,
            lastSyncAttemptAt: attemptedAt
          });
          result.project.githubIntegration = result.integration;
        } catch {
          logger.warn('Não foi possível registrar a falha de solicitação do sync inicial.', {
            event: 'github_initial_sync_status_failed',
            projectId: Number(projectId),
            requestId
          });
        }
      }
    }
    return { project: result.project, integration: result.integration, initialSync };
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
