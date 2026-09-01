import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => {
  const method = () => vi.fn();
  const tx = {
    gitHubAppConnectionState: { findFirst: method(), updateMany: method() },
    gitHubInstallation: { findUnique: method(), create: method(), update: method() },
    gitHubInstallationAuthorization: { upsert: method(), updateMany: method() },
    projectGitHubIntegration: { findUnique: method(), create: method(), update: method() },
    project: { update: method() }
  };
  return {
    tx,
    prisma: {
      gitHubAppConnectionState: { create: method(), findUnique: method() },
      gitHubInstallation: {
        findFirst: method(),
        findMany: method(),
        updateMany: method(),
        upsert: method()
      },
      projectGitHubIntegration: {
        findUnique: method(),
        findMany: method(),
        updateMany: method(),
        upsert: method()
      },
      gitHubWebhookDelivery: { create: method(), findUnique: method(), updateMany: method() },
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

  it('consome state e autoriza instalação na mesma transação', async () => {
    database.tx.gitHubAppConnectionState.findFirst.mockResolvedValue({ id: 3 });
    database.tx.gitHubAppConnectionState.updateMany.mockResolvedValue({ count: 1 });
    database.tx.gitHubInstallation.findUnique.mockResolvedValue(null);
    database.tx.gitHubInstallation.create.mockResolvedValue({ id: 12 });
    database.tx.gitHubInstallationAuthorization.upsert.mockResolvedValue({
      id: 30,
      installationId: 12,
      userId: 7
    });
    const now = new Date('2030-01-01');
    await expect(
      githubRepository.authorizeInstallationFromState({
        stateId: 3,
        now,
        userId: 7,
        installation: {
          githubInstallationId: '77',
          accountId: '700',
          accountLogin: 'traceflow',
          accountType: 'Organization',
          installedAt: now
        }
      })
    ).resolves.toEqual({
      installation: { id: 12 },
      authorization: { id: 30, installationId: 12, userId: 7 }
    });
    expect(database.tx.gitHubInstallation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ githubInstallationId: '77' }) })
    );
    expect(database.tx.gitHubInstallationAuthorization.upsert).toHaveBeenCalledWith({
      where: { installationId_userId: { installationId: 12, userId: 7 } },
      create: {
        installationId: 12,
        userId: 7,
        verifiedAt: now
      },
      update: { verifiedAt: now }
    });
    expect(database.tx.gitHubAppConnectionState.updateMany).toHaveBeenCalledWith({
      where: { id: 3, userId: 7, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now }
    });
    expect(
      database.tx.gitHubInstallationAuthorization.upsert.mock.invocationCallOrder[0]
    ).toBeLessThan(database.tx.gitHubAppConnectionState.updateMany.mock.invocationCallOrder[0]);

    database.tx.gitHubAppConnectionState.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      githubRepository.authorizeInstallationFromState({
        stateId: 3,
        now,
        userId: 7,
        installation: { githubInstallationId: '77' }
      })
    ).resolves.toBeNull();
  });

  it('consulta instalações pela autorização TraceFlow sem snapshot de repositórios', async () => {
    await githubRepository.findAuthorizedInstallation(7, 77);
    await githubRepository.listAuthorizedInstallations(7);

    expect(database.prisma.gitHubInstallation.findFirst).toHaveBeenCalledWith({
      where: {
        githubInstallationId: '77',
        status: 'ACTIVE',
        authorizations: { some: { userId: 7 } }
      }
    });
    expect(database.prisma.gitHubInstallation.findMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE', authorizations: { some: { userId: 7 } } },
      orderBy: { accountLogin: 'asc' }
    });
  });

  it('não tenta consumir o state quando o upsert da autorização falha', async () => {
    database.tx.gitHubAppConnectionState.findFirst.mockResolvedValue({ id: 3 });
    database.tx.gitHubInstallation.findUnique.mockResolvedValue(null);
    database.tx.gitHubInstallation.create.mockResolvedValue({ id: 12 });
    database.tx.gitHubInstallationAuthorization.upsert.mockRejectedValue(new Error('db failure'));

    await expect(
      githubRepository.authorizeInstallationFromState({
        stateId: 3,
        now: new Date('2030-01-01'),
        userId: 7,
        installation: { githubInstallationId: '77' }
      })
    ).rejects.toMatchObject({ callbackStep: 'upsert_authorization' });
    expect(database.tx.gitHubAppConnectionState.updateMany).not.toHaveBeenCalled();
  });

  it('conecta projeto transacionalmente usando somente metadados validados', async () => {
    const repository = {
      githubRepositoryId: '501',
      repositoryName: 'repo',
      repositoryFullName: 'owner/repo',
      repositoryUrl: 'https://github.com/owner/repo',
      defaultBranch: 'main'
    };
    database.tx.projectGitHubIntegration.findUnique.mockResolvedValue(null);
    database.tx.projectGitHubIntegration.create.mockResolvedValue({ id: 14 });
    await expect(githubRepository.connectProject(9, 12, repository)).resolves.toEqual({ id: 14 });
    expect(database.tx.projectGitHubIntegration.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ projectId: 9, githubRepositoryId: '501' })
      })
    );
    expect(database.tx.project.update).not.toHaveBeenCalled();
  });

  it('reconecta o mesmo repositório e rejeita troca sem alterar o histórico', async () => {
    const current = { id: 14, projectId: 9, githubRepositoryId: '501' };
    database.tx.projectGitHubIntegration.findUnique.mockResolvedValue(current);
    database.tx.projectGitHubIntegration.update.mockResolvedValue({ ...current, status: 'ACTIVE' });

    await expect(
      githubRepository.connectProject(9, 12, {
        githubRepositoryId: '501',
        repositoryFullName: 'owner/repo'
      })
    ).resolves.toMatchObject({ githubRepositoryId: '501', status: 'ACTIVE' });
    expect(database.tx.projectGitHubIntegration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 14 },
        data: expect.objectContaining({ githubRepositoryId: '501', installationId: 12 })
      })
    );

    await expect(
      githubRepository.connectProject(9, 13, {
        githubRepositoryId: '502',
        repositoryFullName: 'owner/outro'
      })
    ).rejects.toMatchObject({ code: 'GITHUB_REPOSITORY_SWAP_FORBIDDEN' });
    expect(database.tx.projectGitHubIntegration.update).toHaveBeenCalledTimes(1);
  });

  it('registra deliveries e marca instalações/repositórios para reconexão', async () => {
    database.prisma.gitHubWebhookDelivery.create.mockResolvedValue({ id: 4 });
    await githubRepository.startWebhookDelivery({ deliveryId: 'delivery-1' });
    await githubRepository.completeWebhookDelivery(4);
    await githubRepository.updateInstallationStatus(77, 'SUSPENDED', new Date('2030-01-01'));
    await githubRepository.refreshInstallationMetadata(77, {
      account: { id: 700, login: 'traceflow', type: 'Organization' }
    });
    await githubRepository.upsertInstallationFromWebhook(77, {
      account: { id: 700, login: 'traceflow', type: 'Organization' }
    });
    await githubRepository.requireReconnectForInstallation(77);
    await githubRepository.requireReconnectForRepositories(77, [501, '502']);

    expect(database.prisma.gitHubWebhookDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        deliveryId: 'delivery-1',
        status: 'PROCESSING',
        attemptCount: 1
      })
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

  it('reivindica delivery falho uma vez e mantém duplicata concorrente idempotente', async () => {
    database.prisma.gitHubWebhookDelivery.create.mockRejectedValue({ code: 'P2002' });
    database.prisma.gitHubWebhookDelivery.updateMany.mockResolvedValueOnce({ count: 1 });
    database.prisma.gitHubWebhookDelivery.findUnique.mockResolvedValue({
      id: 4,
      deliveryId: 'delivery-retry',
      status: 'PROCESSING',
      attemptCount: 2
    });

    await expect(
      githubRepository.startWebhookDelivery(
        { deliveryId: 'delivery-retry', event: 'push' },
        new Date('2030-01-01T00:10:00Z'),
        new Date('2030-01-01T00:05:00Z')
      )
    ).resolves.toMatchObject({
      duplicate: false,
      retried: true,
      delivery: { attemptCount: 2 }
    });
    expect(database.prisma.gitHubWebhookDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deliveryId: 'delivery-retry' }),
        data: expect.objectContaining({ attemptCount: { increment: 1 } })
      })
    );

    database.prisma.gitHubWebhookDelivery.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      githubRepository.startWebhookDelivery({ deliveryId: 'delivery-retry', event: 'push' })
    ).resolves.toMatchObject({ duplicate: true, delivery: null });
  });
});
