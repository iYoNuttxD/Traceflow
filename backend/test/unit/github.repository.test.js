import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => {
  const method = () => vi.fn();
  const tx = {
    gitHubInstallation: { upsert: method() },
    gitHubInstallationAuthorization: { upsert: method() },
    projectGitHubIntegration: { upsert: method() },
    project: { update: method() }
  };
  return {
    tx,
    prisma: {
      gitHubAppConnectionState: { create: method(), findUnique: method(), update: method() },
      gitHubInstallation: { findFirst: method(), findMany: method(), updateMany: method() },
      projectGitHubIntegration: { findUnique: method(), findMany: method(), updateMany: method() },
      gitHubWebhookDelivery: { create: method(), update: method() },
      $transaction: vi.fn((callback) => callback(tx))
    }
  };
});

vi.mock('../../src/database/prismaClient.js', () => ({ prisma: database.prisma }));

const { githubRepository } = await import('../../src/modules/github/github.repository.js');

describe('persistência de metadados da GitHub App', () => {
  beforeEach(() => vi.clearAllMocks());

  it('persiste state de uso único e consulta autorização sem credenciais', async () => {
    await githubRepository.createConnectionState({ tokenHash: 'hash' });
    await githubRepository.findConnectionState('hash');
    await githubRepository.useConnectionState(3);
    await githubRepository.findAuthorizedInstallation(7, 77);
    await githubRepository.listAuthorizedInstallations(7);
    await githubRepository.findIntegration(9);
    await githubRepository.findIntegrationByRepositoryId('501');
    await githubRepository.findIntegrationsByRepositoryIds(['501', 502]);
    await githubRepository.findIntegrationsByRepositoryIds([]);

    expect(database.prisma.gitHubAppConnectionState.create).toHaveBeenCalledWith({
      data: { tokenHash: 'hash' }
    });
    expect(database.prisma.gitHubInstallation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ githubInstallationId: '77' }) })
    );
    expect(database.prisma.projectGitHubIntegration.findUnique).toHaveBeenCalledWith({
      where: { projectId: 9 },
      include: { installation: true }
    });
    expect(database.prisma.projectGitHubIntegration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { githubRepositoryId: { in: ['501', '502'] } } })
    );
  });

  it('faz upsert transacional da instalação e da autorização do usuário', async () => {
    database.tx.gitHubInstallation.upsert.mockResolvedValue({ id: 12 });
    await expect(
      githubRepository.authorizeInstallation({
        userId: 7,
        githubInstallationId: '77',
        accountId: '700',
        accountLogin: 'traceflow',
        accountType: 'Organization',
        installedAt: new Date('2030-01-01')
      })
    ).resolves.toEqual({ id: 12 });
    expect(database.tx.gitHubInstallationAuthorization.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { installationId_userId: { installationId: 12, userId: 7 } }
      })
    );
  });

  it('conecta projeto transacionalmente usando somente metadados validados', async () => {
    const repository = {
      githubRepositoryId: '501',
      repositoryName: 'repo',
      repositoryFullName: 'owner/repo',
      repositoryUrl: 'https://github.com/owner/repo',
      defaultBranch: 'main'
    };
    database.tx.projectGitHubIntegration.upsert.mockResolvedValue({ id: 14 });
    await expect(githubRepository.connectProject(9, 12, repository)).resolves.toEqual({ id: 14 });
    expect(database.tx.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 9 },
        data: expect.objectContaining({ githubOwner: 'owner', githubRepositoryId: '501' })
      })
    );
  });

  it('registra deliveries e marca instalações/repositórios para reconexão', async () => {
    await githubRepository.createWebhookDelivery({ deliveryId: 'delivery-1' });
    await githubRepository.completeWebhookDelivery(4);
    await githubRepository.updateInstallationStatus(77, 'SUSPENDED', new Date('2030-01-01'));
    await githubRepository.refreshInstallationMetadata(77, {
      account: { id: 700, login: 'traceflow', type: 'Organization' }
    });
    await githubRepository.requireReconnectForInstallation(77);
    await githubRepository.requireReconnectForRepositories(77, [501, '502']);

    expect(database.prisma.gitHubWebhookDelivery.create).toHaveBeenCalledWith({
      data: { deliveryId: 'delivery-1' }
    });
    expect(database.prisma.gitHubInstallation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { githubInstallationId: '77' } })
    );
    expect(database.prisma.projectGitHubIntegration.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ githubRepositoryId: { in: ['501', '502'] } })
      })
    );
  });
});
