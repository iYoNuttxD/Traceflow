import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { AppError, ERROR_CODES } from '../../shared/errors/index.js';
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
const repositoryConflict = () =>
  new AppError({
    message: 'Este repositório GitHub já está conectado a outro projeto.',
    statusCode: 409,
    code: ERROR_CODES.CONFLICT,
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
  async completeCallback({ user, session, code, installationId, state }) {
    const record = await githubRepository.findConnectionState(hashToken(state));
    if (
      !record ||
      record.usedAt ||
      record.expiresAt <= new Date() ||
      record.userId !== user.id ||
      record.sessionId !== session.id
    ) {
      throw forbidden('Estado da conexão GitHub inválido, expirado ou já utilizado.');
    }
    const userToken = await githubAppCredentialProvider.exchangeUserCode(code);
    const userClient = githubAppCredentialProvider.createUserClient(userToken);
    const installations = await userClient.paginate(
      userClient.rest.apps.listInstallationsForAuthenticatedUser,
      { per_page: 100 }
    );
    const accessible = installations.find((item) => String(item.id) === String(installationId));
    if (!accessible)
      throw forbidden('A instalação informada não pertence ao usuário autenticado no GitHub.');
    const installation = await githubRepository.authorizeInstallation({
      userId: user.id,
      githubInstallationId: String(accessible.id),
      accountId: String(accessible.account?.id),
      accountLogin: accessible.account?.login || accessible.account?.name || 'unknown',
      accountType: accessible.account?.type || 'Unknown',
      installedAt: accessible.created_at ? new Date(accessible.created_at) : new Date()
    });
    await githubRepository.useConnectionState(record.id);
    return {
      installation: installationDto(installation),
      intendedAction: record.intendedAction,
      projectId: record.projectId
    };
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
    const integrations = await githubRepository.findIntegrationsByRepositoryIds(
      repositories.map((repository) => repository.githubRepositoryId)
    );
    const integrationByRepositoryId = new Map(
      integrations.map((integration) => [String(integration.githubRepositoryId), integration])
    );
    return repositories.map((repository) => {
      const integration = integrationByRepositoryId.get(String(repository.githubRepositoryId));
      const connectedToCurrentProject = Boolean(
        integration && projectId && integration.projectId === Number(projectId)
      );
      return {
        ...repository,
        availability: integration ? 'CONNECTED' : 'AVAILABLE',
        alreadyConnected: Boolean(integration),
        connectedToCurrentProject,
        selectable: !integration || connectedToCurrentProject
      };
    });
  },
  async assertRepositoryAvailable(githubRepositoryId, projectId) {
    const integration = await githubRepository.findIntegrationByRepositoryId(githubRepositoryId);
    if (integration && integration.projectId !== Number(projectId)) throw repositoryConflict();
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
    await this.assertRepositoryAvailable(repository.githubRepositoryId, projectId);
    try {
      return await githubRepository.connectProject(Number(projectId), installation.id, {
        githubRepositoryId: repository.githubRepositoryId,
        repositoryName: repository.name,
        repositoryFullName: repository.fullName,
        repositoryUrl: repository.url,
        defaultBranch: repository.defaultBranch
      });
    } catch (error) {
      if (error?.code === 'P2002') throw repositoryConflict();
      throw error;
    }
  },
  verifyWebhookSignature(rawBody, suppliedSignature) {
    if (!env.githubAppConfigured || !suppliedSignature?.startsWith('sha256=')) return false;
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
      if (payload.action === 'suspend') {
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
