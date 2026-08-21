import { prisma } from '../../database/prismaClient.js';

const blockedInstallationStatuses = new Set(['SUSPENDED', 'REMOVED']);

function repositorySwapError() {
  return Object.assign(new Error('O projeto já está vinculado a outro repositório GitHub.'), {
    code: 'GITHUB_REPOSITORY_SWAP_FORBIDDEN'
  });
}

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
      include: { user: { include: { githubIdentity: true } }, session: true }
    });
  },
  async authorizeInstallationFromState({
    stateId,
    now,
    userId,
    installation: data,
    repositories = [],
    repositoryAuthorizationExpiresAt
  }) {
    try {
      return await prisma.$transaction(async (tx) => {
        const availableState = await tx.gitHubAppConnectionState.findFirst({
          where: { id: stateId, userId, usedAt: null, expiresAt: { gt: now } },
          select: { id: true }
        });
        if (!availableState) return null;

        let installation;
        try {
          const current = await tx.gitHubInstallation.findUnique({
            where: { githubInstallationId: data.githubInstallationId }
          });
          if (blockedInstallationStatuses.has(current?.status)) {
            return { lifecycleBlocked: current.status };
          }
          installation = current
            ? await tx.gitHubInstallation.update({
                where: { id: current.id },
                data: {
                  accountId: data.accountId,
                  accountLogin: data.accountLogin,
                  accountType: data.accountType,
                  ...(current.status === 'PENDING' ? { status: 'ACTIVE' } : {})
                }
              })
            : await tx.gitHubInstallation.create({
                data: { ...data, status: 'ACTIVE' }
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

        try {
          await tx.gitHubRepositoryAuthorization.deleteMany({
            where: { installationId: installation.id, userId }
          });
          if (repositories.length > 0) {
            await tx.gitHubRepositoryAuthorization.createMany({
              data: repositories.map((repository) => ({
                installationId: installation.id,
                userId,
                githubRepositoryId: String(repository.githubRepositoryId),
                repositoryFullName: repository.fullName,
                permission: repository.permission,
                verifiedAt: now,
                expiresAt: repositoryAuthorizationExpiresAt
              }))
            });
          }
        } catch (error) {
          throw callbackPersistenceError('replace_repository_authorizations', error);
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

        return { installation, authorization, authorizedRepositoryCount: repositories.length };
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
  findRepositoryAuthorizations(userId, installationId, now = new Date()) {
    return prisma.gitHubRepositoryAuthorization.findMany({
      where: {
        userId,
        installationId,
        expiresAt: { gt: now },
        permission: { in: ['OWNER', 'ADMIN'] }
      },
      select: {
        githubRepositoryId: true,
        repositoryFullName: true,
        permission: true,
        verifiedAt: true,
        expiresAt: true
      }
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
    const integratedAt = new Date();
    return prisma.$transaction(async (tx) => {
      const current = await tx.projectGitHubIntegration.findUnique({ where: { projectId } });
      if (
        current?.githubRepositoryId &&
        String(current.githubRepositoryId) !== String(repository.githubRepositoryId)
      ) {
        throw repositorySwapError();
      }
      const data = {
        installationId,
        ...repository,
        integratedAt,
        status: 'ACTIVE',
        lastValidatedAt: integratedAt,
        lastSyncStatus: 'PENDENTE',
        lastSyncError: null
      };
      return current
        ? tx.projectGitHubIntegration.update({ where: { id: current.id }, data })
        : tx.projectGitHubIntegration.create({ data: { projectId, ...data } });
    });
  },
  async startWebhookDelivery(data, now = new Date(), staleBefore = new Date(0)) {
    try {
      const delivery = await prisma.gitHubWebhookDelivery.create({
        data: {
          ...data,
          status: 'PROCESSING',
          attemptCount: 1,
          lastAttemptAt: now
        }
      });
      return { delivery, duplicate: false, retried: false };
    } catch (error) {
      if (error?.code !== 'P2002') throw error;
    }

    const claimed = await prisma.gitHubWebhookDelivery.updateMany({
      where: {
        deliveryId: data.deliveryId,
        OR: [{ status: 'FAILED' }, { status: 'PROCESSING', lastAttemptAt: { lt: staleBefore } }]
      },
      data: {
        status: 'PROCESSING',
        attemptCount: { increment: 1 },
        lastAttemptAt: now,
        processedAt: null,
        failureStep: null,
        failureCode: null
      }
    });
    if (claimed.count !== 1) return { delivery: null, duplicate: true, retried: false };
    return {
      delivery: await prisma.gitHubWebhookDelivery.findUnique({
        where: { deliveryId: data.deliveryId }
      }),
      duplicate: false,
      retried: true
    };
  },
  completeWebhookDelivery(id) {
    return prisma.gitHubWebhookDelivery.updateMany({
      where: { id, status: 'PROCESSING' },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
        failureStep: null,
        failureCode: null
      }
    });
  },
  failWebhookDelivery(id, failureStep, failureCode, now = new Date()) {
    return prisma.gitHubWebhookDelivery.updateMany({
      where: { id, status: 'PROCESSING' },
      data: {
        status: 'FAILED',
        lastAttemptAt: now,
        failureStep: String(failureStep).slice(0, 191),
        failureCode: String(failureCode).slice(0, 191)
      }
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
      ...(installation.account?.type ? { accountType: installation.account.type } : {})
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
        status: 'PENDING'
      },
      update: {
        ...(installation.account?.id ? { accountId: String(installation.account.id) } : {}),
        accountLogin,
        ...(installation.account?.type ? { accountType: installation.account.type } : {})
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
  },
  expireRepositoryAuthorizationsForInstallation(githubInstallationId, now = new Date()) {
    return prisma.gitHubRepositoryAuthorization.updateMany({
      where: { installation: { githubInstallationId: String(githubInstallationId) } },
      data: { expiresAt: now }
    });
  },
  expireRepositoryAuthorizationsForRepositories(
    githubInstallationId,
    repositoryIds,
    now = new Date()
  ) {
    return prisma.gitHubRepositoryAuthorization.updateMany({
      where: {
        installation: { githubInstallationId: String(githubInstallationId) },
        githubRepositoryId: { in: repositoryIds.map(String) }
      },
      data: { expiresAt: now }
    });
  }
};
