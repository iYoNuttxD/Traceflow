import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  repository: {
    createConnectionState: vi.fn(),
    findConnectionState: vi.fn(),
    useConnectionState: vi.fn(),
    authorizeInstallation: vi.fn(),
    findAuthorizedInstallation: vi.fn(),
    listAuthorizedInstallations: vi.fn(),
    findIntegrationByRepositoryId: vi.fn(),
    findIntegrationsByRepositoryIds: vi.fn(),
    connectProject: vi.fn(),
    createWebhookDelivery: vi.fn(),
    completeWebhookDelivery: vi.fn(),
    updateInstallationStatus: vi.fn(),
    refreshInstallationMetadata: vi.fn(),
    requireReconnectForInstallation: vi.fn(),
    requireReconnectForRepositories: vi.fn()
  },
  credentialProvider: { exchangeUserCode: vi.fn(), createUserClient: vi.fn() },
  authorization: { membership: vi.fn() },
  clientFactory: { forInstallation: vi.fn() }
}));

vi.mock('../../src/config/env.js', () => ({
  env: {
    githubAppConfigured: true,
    githubAppSlug: 'traceflow-test',
    githubAppStateTtlMs: 600000,
    githubAppWebhookSecret: 'webhook-secret-artificial'
  }
}));
vi.mock('../../src/modules/github/github.repository.js', () => ({
  githubRepository: mocks.repository
}));
vi.mock('../../src/modules/github/github-credential.provider.js', () => ({
  githubAppCredentialProvider: mocks.credentialProvider
}));
vi.mock('../../src/modules/github/github.client.js', () => ({
  githubInstallationClientFactory: mocks.clientFactory
}));
vi.mock('../../src/modules/authorization/authorization.service.js', () => ({
  authorizationService: mocks.authorization
}));

const { githubAppService } = await import('../../src/modules/github/github-app.service.js');

describe('autorização e webhooks da GitHub App L1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorization.membership.mockResolvedValue({ role: 'OWNER' });
    mocks.repository.createConnectionState.mockResolvedValue({ id: 1 });
    mocks.repository.findIntegrationByRepositoryId.mockResolvedValue(null);
    mocks.repository.findIntegrationsByRepositoryIds.mockResolvedValue([]);
  });

  it('salva somente hash do state e vincula usuário, sessão e intenção', async () => {
    const result = await githubAppService.startInstallation({
      user: { id: 7 },
      session: { id: 8 },
      intendedAction: 'CONNECT_PROJECT',
      projectId: 9
    });
    const stored = mocks.repository.createConnectionState.mock.calls[0][0];
    const state = new URL(result.url).searchParams.get('state');
    expect(stored).toMatchObject({
      userId: 7,
      sessionId: 8,
      projectId: 9,
      intendedAction: 'CONNECT_PROJECT'
    });
    expect(stored.tokenHash).not.toBe(state);
    expect(stored.tokenHash).toHaveLength(64);
  });

  it('rejeita state de outra sessão e instalação forjada sem persistir token temporário', async () => {
    mocks.repository.findConnectionState.mockResolvedValue({
      id: 1,
      userId: 7,
      sessionId: 999,
      expiresAt: new Date(Date.now() + 1000),
      usedAt: null
    });
    await expect(
      githubAppService.completeCallback({
        user: { id: 7 },
        session: { id: 8 },
        code: 'code',
        installationId: '77',
        state: 'state-artificial-com-mais-de-trinta-caracteres'
      })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.credentialProvider.exchangeUserCode).not.toHaveBeenCalled();

    mocks.repository.findConnectionState.mockResolvedValue({
      id: 1,
      userId: 7,
      sessionId: 8,
      expiresAt: new Date(Date.now() + 1000),
      usedAt: null,
      intendedAction: 'CREATE_PROJECT',
      projectId: null
    });
    mocks.credentialProvider.exchangeUserCode.mockResolvedValue('user-token-temporario');
    mocks.credentialProvider.createUserClient.mockReturnValue({
      paginate: vi
        .fn()
        .mockResolvedValue([{ id: 88, account: { id: 1, login: 'other', type: 'User' } }]),
      rest: { apps: { listInstallationsForAuthenticatedUser: vi.fn() } }
    });
    await expect(
      githubAppService.completeCallback({
        user: { id: 7 },
        session: { id: 8 },
        code: 'code',
        installationId: '77',
        state: 'state-artificial-com-mais-de-trinta-caracteres'
      })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.repository.authorizeInstallation).not.toHaveBeenCalled();
  });

  it('rejeita state expirado ou reutilizado e consome state válido uma única vez', async () => {
    const callback = {
      user: { id: 7 },
      session: { id: 8 },
      code: 'code',
      installationId: '77',
      state: 'state-artificial-com-mais-de-trinta-caracteres'
    };
    for (const record of [
      { expiresAt: new Date(Date.now() - 1000), usedAt: null },
      { expiresAt: new Date(Date.now() + 1000), usedAt: new Date() }
    ]) {
      mocks.repository.findConnectionState.mockResolvedValue({
        id: 1,
        userId: 7,
        sessionId: 8,
        ...record
      });
      await expect(githubAppService.completeCallback(callback)).rejects.toMatchObject({
        statusCode: 403
      });
    }

    mocks.repository.findConnectionState.mockResolvedValue({
      id: 1,
      userId: 7,
      sessionId: 8,
      expiresAt: new Date(Date.now() + 1000),
      usedAt: null,
      intendedAction: 'CREATE_PROJECT',
      projectId: null
    });
    mocks.credentialProvider.exchangeUserCode.mockResolvedValue('token-efemero');
    mocks.credentialProvider.createUserClient.mockReturnValue({
      paginate: vi.fn().mockResolvedValue([
        {
          id: 77,
          account: { id: 700, login: 'traceflow', type: 'Organization' },
          created_at: '2030-01-01T00:00:00Z'
        }
      ]),
      rest: { apps: { listInstallationsForAuthenticatedUser: vi.fn() } }
    });
    mocks.repository.authorizeInstallation.mockResolvedValue({
      id: 12,
      githubInstallationId: '77',
      accountLogin: 'traceflow',
      accountType: 'Organization',
      status: 'ACTIVE'
    });
    await expect(githubAppService.completeCallback(callback)).resolves.toMatchObject({
      installation: { githubInstallationId: '77' }
    });
    expect(mocks.repository.useConnectionState).toHaveBeenCalledWith(1);
    expect(JSON.stringify(mocks.repository.authorizeInstallation.mock.calls)).not.toContain(
      'token-efemero'
    );
  });

  it('nega não OWNER e instalação/repositório não autorizados', async () => {
    mocks.authorization.membership.mockResolvedValue({ role: 'MANAGER' });
    await expect(
      githubAppService.startInstallation({
        user: { id: 7 },
        session: { id: 8 },
        intendedAction: 'CONNECT_PROJECT',
        projectId: 9
      })
    ).rejects.toMatchObject({ statusCode: 403 });

    mocks.repository.findAuthorizedInstallation.mockResolvedValue(null);
    await expect(githubAppService.listRepositories(7, 77)).rejects.toMatchObject({
      statusCode: 403
    });

    mocks.repository.findAuthorizedInstallation.mockResolvedValue({
      id: 12,
      githubInstallationId: '77'
    });
    mocks.clientFactory.forInstallation.mockResolvedValue({
      listRepositoryPages: () =>
        (async function* pages() {
          yield [{ githubRepositoryId: '501' }];
        })()
    });
    await expect(githubAppService.resolveAuthorizedRepository(7, 77, 999)).rejects.toMatchObject({
      statusCode: 404
    });
  });

  it('lista zero, um ou vários repositórios e marca somente os já utilizados', async () => {
    mocks.repository.findAuthorizedInstallation.mockResolvedValue({
      id: 12,
      githubInstallationId: '77'
    });
    const repositoryPages = vi.fn();
    mocks.clientFactory.forInstallation.mockResolvedValue({ listRepositoryPages: repositoryPages });

    repositoryPages.mockReturnValueOnce(
      (async function* emptyPages() {
        yield [];
      })()
    );
    await expect(githubAppService.listRepositories(7, 77)).resolves.toEqual([]);

    const repositories = [
      { githubRepositoryId: '501', fullName: 'org/a', defaultBranch: 'main' },
      { githubRepositoryId: '502', fullName: 'org/b', defaultBranch: 'develop' },
      { githubRepositoryId: '503', fullName: 'org/c', defaultBranch: 'trunk' }
    ];
    repositoryPages.mockReturnValueOnce(
      (async function* multiplePages() {
        yield repositories.slice(0, 2);
        yield repositories.slice(2);
      })()
    );
    mocks.repository.findIntegrationsByRepositoryIds.mockResolvedValue([
      { githubRepositoryId: '502', projectId: 20, status: 'ACTIVE' }
    ]);
    const listed = await githubAppService.listRepositories(7, 77);
    expect(listed).toHaveLength(3);
    expect(listed[0]).toMatchObject({ availability: 'AVAILABLE', selectable: true });
    expect(listed[1]).toMatchObject({
      availability: 'CONNECTED',
      alreadyConnected: true,
      selectable: false
    });
    expect(listed[2]).toMatchObject({ availability: 'AVAILABLE', selectable: true });
  });

  it('permite o repositório do próprio projeto e bloqueia o de outro projeto', async () => {
    mocks.repository.findIntegrationByRepositoryId
      .mockResolvedValueOnce({ githubRepositoryId: '501', projectId: 9, status: 'ACTIVE' })
      .mockResolvedValueOnce({ githubRepositoryId: '502', projectId: 10, status: 'ACTIVE' });
    await expect(githubAppService.assertRepositoryAvailable('501', 9)).resolves.toMatchObject({
      projectId: 9
    });
    await expect(githubAppService.assertRepositoryAvailable('502', 9)).rejects.toMatchObject({
      statusCode: 409
    });
  });

  it('valida HMAC, trata delivery duplicado e desconecta repositórios removidos sem apagar artifacts', async () => {
    const rawBody = Buffer.from(
      JSON.stringify({
        action: 'removed',
        installation: { id: 77 },
        repositories_removed: [{ id: 501 }]
      })
    );
    const signature = `sha256=${createHmac('sha256', 'webhook-secret-artificial').update(rawBody).digest('hex')}`;
    mocks.repository.createWebhookDelivery.mockResolvedValue({ id: 12 });
    await expect(
      githubAppService.processWebhook({
        rawBody,
        signature,
        deliveryId: 'delivery-1',
        event: 'installation_repositories'
      })
    ).resolves.toEqual({ duplicate: false });
    expect(mocks.repository.requireReconnectForRepositories).toHaveBeenCalledWith(77, [501]);
    expect(mocks.repository.refreshInstallationMetadata).toHaveBeenCalledWith(
      77,
      expect.objectContaining({ id: 77 })
    );
    expect(mocks.repository.completeWebhookDelivery).toHaveBeenCalledWith(12);

    mocks.repository.createWebhookDelivery.mockRejectedValue({ code: 'P2002' });
    await expect(
      githubAppService.processWebhook({
        rawBody,
        signature,
        deliveryId: 'delivery-1',
        event: 'installation_repositories'
      })
    ).resolves.toEqual({ duplicate: true });
    await expect(
      githubAppService.processWebhook({
        rawBody,
        signature: 'sha256=invalid',
        deliveryId: 'delivery-2',
        event: 'installation'
      })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('marca instalação suspensa e seus projetos para reconexão', async () => {
    const rawBody = Buffer.from(JSON.stringify({ action: 'suspend', installation: { id: 77 } }));
    const signature = `sha256=${createHmac('sha256', 'webhook-secret-artificial').update(rawBody).digest('hex')}`;
    mocks.repository.createWebhookDelivery.mockResolvedValue({ id: 13 });
    await githubAppService.processWebhook({
      rawBody,
      signature,
      deliveryId: 'delivery-suspend',
      event: 'installation'
    });
    expect(mocks.repository.updateInstallationStatus).toHaveBeenCalledWith(
      77,
      'SUSPENDED',
      expect.any(Date)
    );
    expect(mocks.repository.requireReconnectForInstallation).toHaveBeenCalledWith(77);
  });

  it('aceita adição posterior sem alterar integrações existentes', async () => {
    const rawBody = Buffer.from(
      JSON.stringify({
        action: 'added',
        installation: {
          id: 77,
          account: { id: 700, login: 'traceflow', type: 'Organization' }
        },
        repositories_added: [{ id: 504 }]
      })
    );
    const signature = `sha256=${createHmac('sha256', 'webhook-secret-artificial').update(rawBody).digest('hex')}`;
    mocks.repository.createWebhookDelivery.mockResolvedValue({ id: 14 });
    await githubAppService.processWebhook({
      rawBody,
      signature,
      deliveryId: 'delivery-added',
      event: 'installation_repositories'
    });
    expect(mocks.repository.refreshInstallationMetadata).toHaveBeenCalledWith(
      77,
      expect.objectContaining({ id: 77 })
    );
    expect(mocks.repository.requireReconnectForRepositories).not.toHaveBeenCalled();
    expect(mocks.repository.requireReconnectForInstallation).not.toHaveBeenCalled();
  });
});
