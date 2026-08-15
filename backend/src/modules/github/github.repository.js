import { prisma } from '../../database/prismaClient.js';

function callbackPersistenceError(callbackStep, cause) {
  return Object.assign(new Error(`Falha na etapa ${callbackStep} do callback da GitHub App.`), {
    callbackStep,
    cause
  });
}

export const githubRepository = {
  createConnectionState(data) {
    return prisma.gitHubAppConnectionState.create({ data });
  },
  findConnectionState(tokenHash) {
    return prisma.gitHubAppConnectionState.findUnique({
      where: { tokenHash },
      include: { user: true, session: true }
    });
  },
  async authorizeInstallationFromState({ stateId, now, userId, installation: data }) {
    try {
      return await prisma.$transaction(async (tx) => {
        const availableState = await tx.gitHubAppConnectionState.findFirst({
          where: { id: stateId, userId, usedAt: null, expiresAt: { gt: now } },
          select: { id: true }
        });
        if (!availableState) return null;

        let installation;
        try {
          installation = await tx.gitHubInstallation.upsert({
            where: { githubInstallationId: data.githubInstallationId },
            create: { ...data, status: 'ACTIVE' },
            update: {
              accountId: data.accountId,
              accountLogin: data.accountLogin,
              accountType: data.accountType,
              status: 'ACTIVE',
              suspendedAt: null
            }
          });
        } catch (error) {
          throw callbackPersistenceError('upsert_installation', error);
        }

        let authorization;
        try {
          authorization = await tx.gitHubInstallationAuthorization.upsert({
            where: { installationId_userId: { installationId: installation.id, userId } },
            create: { installationId: installation.id, userId, verifiedAt: now },
            update: { verifiedAt: now }
          });
        } catch (error) {
          throw callbackPersistenceError('upsert_authorization', error);
        }

        let claimed;
        try {
          claimed = await tx.gitHubAppConnectionState.updateMany({
            where: { id: stateId, userId, usedAt: null, expiresAt: { gt: now } },
            data: { usedAt: now }
          });
        } catch (error) {
          throw callbackPersistenceError('consume_state', error);
        }
        if (claimed.count !== 1) throw callbackPersistenceError('consume_state');

        return { installation, authorization };
      });
    } catch (error) {
      if (error.callbackStep === 'consume_state' && !error.cause) return null;
      throw error;
    }
  },
  findAuthorizedInstallation(userId, githubInstallationId) {
    return prisma.gitHubInstallation.findFirst({
      where: {
        githubInstallationId: String(githubInstallationId),
        status: 'ACTIVE',
        authorizations: { some: { userId } }
      }
    });
  },
  listAuthorizedInstallations(userId) {
    return prisma.gitHubInstallation.findMany({
      where: { status: 'ACTIVE', authorizations: { some: { userId } } },
      orderBy: { accountLogin: 'asc' }
    });
  },
  findIntegration(projectId) {
    return prisma.projectGitHubIntegration.findUnique({
      where: { projectId },
      include: { installation: true }
    });
  },
  findIntegrationByRepositoryId(githubRepositoryId, userId) {
    return prisma.projectGitHubIntegration.findUnique({
      where: { githubRepositoryId: String(githubRepositoryId) },
      select: {
        id: true,
        projectId: true,
        githubRepositoryId: true,
        status: true,
        project: {
          select: {
            id: true,
            name: true,
            memberships: {
              where: { userId, isActive: true },
              select: { id: true }
            }
          }
        }
      }
    });
  },
  findIntegrationsByRepositoryIds(githubRepositoryIds, userId) {
    if (githubRepositoryIds.length === 0) return [];
    return prisma.projectGitHubIntegration.findMany({
      where: { githubRepositoryId: { in: githubRepositoryIds.map(String) } },
      select: {
        id: true,
        projectId: true,
        githubRepositoryId: true,
        status: true,
        project: {
          select: {
            id: true,
            name: true,
            memberships: {
              where: { userId, isActive: true },
              select: { id: true }
            }
          }
        }
      }
    });
  },
  connectProject(projectId, installationId, repository) {
    return prisma.$transaction(async (tx) => {
      const integration = await tx.projectGitHubIntegration.upsert({
        where: { projectId },
        create: {
          projectId,
          installationId,
          ...repository,
          status: 'ACTIVE',
          lastValidatedAt: new Date()
        },
        update: {
          installationId,
          ...repository,
          status: 'ACTIVE',
          lastValidatedAt: new Date(),
          lastSyncError: null
        }
      });
      await tx.project.update({
        where: { id: projectId },
        data: {
          githubRepositoryId: repository.githubRepositoryId,
          githubRepositoryName: repository.repositoryName,
          githubRepositoryFullName: repository.repositoryFullName,
          githubRepositoryUrl: repository.repositoryUrl,
          githubOwner: repository.repositoryFullName.split('/')[0],
          githubRepo: repository.repositoryName,
          githubUrl: repository.repositoryUrl,
          githubDefaultBranch: repository.defaultBranch,
          githubIntegratedAt: new Date(),
          githubSyncStatus: 'PENDENTE'
        }
      });
      return integration;
    });
  },
  createWebhookDelivery(data) {
    return prisma.gitHubWebhookDelivery.create({ data });
  },
  completeWebhookDelivery(id) {
    return prisma.gitHubWebhookDelivery.update({
      where: { id },
      data: { processedAt: new Date() }
    });
  },
  updateInstallationStatus(githubInstallationId, status, suspendedAt = null) {
    return prisma.gitHubInstallation.updateMany({
      where: { githubInstallationId: String(githubInstallationId) },
      data: { status, suspendedAt }
    });
  },
  refreshInstallationMetadata(githubInstallationId, installation) {
    const data = {
      ...(installation.account?.id ? { accountId: String(installation.account.id) } : {}),
      ...(installation.account?.login || installation.account?.name
        ? { accountLogin: installation.account.login || installation.account.name }
        : {}),
      ...(installation.account?.type ? { accountType: installation.account.type } : {}),
      status: 'ACTIVE',
      suspendedAt: null
    };
    return prisma.gitHubInstallation.updateMany({
      where: { githubInstallationId: String(githubInstallationId) },
      data
    });
  },
  upsertInstallationFromWebhook(githubInstallationId, installation) {
    const accountLogin = installation.account?.login || installation.account?.name || 'unknown';
    return prisma.gitHubInstallation.upsert({
      where: { githubInstallationId: String(githubInstallationId) },
      create: {
        githubInstallationId: String(githubInstallationId),
        accountId: String(installation.account?.id || 'unknown'),
        accountLogin,
        accountType: installation.account?.type || 'Unknown',
        installedAt: installation.created_at ? new Date(installation.created_at) : new Date(),
        status: 'ACTIVE'
      },
      update: {
        ...(installation.account?.id ? { accountId: String(installation.account.id) } : {}),
        accountLogin,
        ...(installation.account?.type ? { accountType: installation.account.type } : {}),
        status: 'ACTIVE',
        suspendedAt: null
      }
    });
  },
  requireReconnectForInstallation(githubInstallationId) {
    return prisma.projectGitHubIntegration.updateMany({
      where: { installation: { githubInstallationId: String(githubInstallationId) } },
      data: {
        status: 'RECONNECT_REQUIRED',
        lastSyncStatus: 'BLOQUEADO',
        lastSyncError: 'A instalação GitHub não está ativa.'
      }
    });
  },
  requireReconnectForRepositories(githubInstallationId, repositoryIds) {
    return prisma.projectGitHubIntegration.updateMany({
      where: {
        installation: { githubInstallationId: String(githubInstallationId) },
        githubRepositoryId: { in: repositoryIds.map(String) }
      },
      data: {
        status: 'RECONNECT_REQUIRED',
        lastSyncStatus: 'BLOQUEADO',
        lastSyncError: 'O repositório não está mais acessível pela GitHub App.'
      }
    });
  }
};
