import { prisma } from '../../database/prismaClient.js';

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
  useConnectionState(id) {
    return prisma.gitHubAppConnectionState.update({ where: { id }, data: { usedAt: new Date() } });
  },
  async authorizeInstallation({
    userId,
    githubInstallationId,
    accountId,
    accountLogin,
    accountType,
    installedAt
  }) {
    return prisma.$transaction(async (tx) => {
      const installation = await tx.gitHubInstallation.upsert({
        where: { githubInstallationId },
        create: {
          githubInstallationId,
          accountId,
          accountLogin,
          accountType,
          installedAt,
          status: 'ACTIVE'
        },
        update: { accountId, accountLogin, accountType, status: 'ACTIVE', suspendedAt: null }
      });
      await tx.gitHubInstallationAuthorization.upsert({
        where: { installationId_userId: { installationId: installation.id, userId } },
        create: { installationId: installation.id, userId, verifiedAt: new Date() },
        update: { verifiedAt: new Date() }
      });
      return installation;
    });
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
  findIntegrationByRepositoryId(githubRepositoryId) {
    return prisma.projectGitHubIntegration.findUnique({
      where: { githubRepositoryId: String(githubRepositoryId) },
      select: { id: true, projectId: true, githubRepositoryId: true, status: true }
    });
  },
  findIntegrationsByRepositoryIds(githubRepositoryIds) {
    if (githubRepositoryIds.length === 0) return [];
    return prisma.projectGitHubIntegration.findMany({
      where: { githubRepositoryId: { in: githubRepositoryIds.map(String) } },
      select: { id: true, projectId: true, githubRepositoryId: true, status: true }
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
