import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  logger: { info: vi.fn(), warn: vi.fn() },
  repository: {
    createConnectionState: vi.fn(),
    findConnectionState: vi.fn(),
    authorizeInstallationFromState: vi.fn(),
    findAuthorizedInstallation: vi.fn(),
    listAuthorizedInstallations: vi.fn(),
    findIntegrationByRepositoryId: vi.fn(),
    findIntegrationsByRepositoryIds: vi.fn(),
    connectProject: vi.fn(),
    createWebhookDelivery: vi.fn(),
    completeWebhookDelivery: vi.fn(),
    updateInstallationStatus: vi.fn(),
    refreshInstallationMetadata: vi.fn(),
    upsertInstallationFromWebhook: vi.fn(),
    requireReconnectForInstallation: vi.fn(),
    requireReconnectForRepositories: vi.fn()
  },
  credentialProvider: {
    exchangeInstallationUserCode: vi.fn(),
    listInstallationsAccessibleToUser: vi.fn()
  },
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
vi.mock('../../src/shared/logger/index.js', () => ({ logger: mocks.logger }));

const { githubAppService } = await import('../../src/modules/github/github-app.service.js');

function validStateRecord(overrides = {}) {
  const expiresAt = new Date(Date.now() + 60_000);
  return {
    id: 1,
    userId: 7,
    sessionId: 8,
    expiresAt,
    usedAt: null,
    intendedAction: 'CREATE_PROJECT',
    projectId: null,
    user: { id: 7, isActive: true, sessionVersion: 1 },
    session: {
      id: 8,
      userId: 7,
      sessionVersion: 1,
      expiresAt,
      revokedAt: null
    },
    ...overrides
  };
}

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

  it('rejeita sessão inicial revogada e instalação forjada sem persistir token temporário', async () => {
    mocks.repository.findConnectionState.mockResolvedValue(
      validStateRecord({
        session: {
          id: 8,
          userId: 7,
          sessionVersion: 1,
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: new Date()
        }
      })
    );
    await expect(
      githubAppService.completeCallback({
        code: 'code',
        installationId: '77',
        state: 'state-artificial-com-mais-de-trinta-caracteres'
      })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.credentialProvider.exchangeInstallationUserCode).not.toHaveBeenCalled();

    mocks.repository.findConnectionState.mockResolvedValue(validStateRecord());
    mocks.credentialProvider.exchangeInstallationUserCode.mockResolvedValue(
      'user-token-temporario'
    );
    mocks.credentialProvider.listInstallationsAccessibleToUser.mockResolvedValue([
      {
        githubInstallationId: '88',
        accountId: '1',
        accountLogin: 'other',
        accountType: 'User',
        installedAt: new Date()
      }
    ]);
    await expect(
      githubAppService.completeCallback({
        code: 'code',
        installationId: '77',
        state: 'state-artificial-com-mais-de-trinta-caracteres'
      })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.repository.authorizeInstallationFromState).not.toHaveBeenCalled();
  });

  it('rejeita callback sem state, com state curto ou intenção incompatível', async () => {
    for (const state of [undefined, 'curto']) {
      await expect(
        githubAppService.completeCallback({ code: 'code', installationId: '77', state })
      ).rejects.toMatchObject({ statusCode: 403 });
    }
    mocks.repository.findConnectionState.mockResolvedValue(
      validStateRecord({ intendedAction: 'CONNECT_PROJECT', projectId: null })
    );
    await expect(
      githubAppService.completeCallback({
        code: 'code',
        installationId: '77',
        state: 'state-artificial-com-mais-de-trinta-caracteres'
      })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.credentialProvider.exchangeInstallationUserCode).not.toHaveBeenCalled();
  });

  it('rejeita state expirado ou reutilizado e consome state válido uma única vez', async () => {
    const callback = {
      code: 'oauth-code-confidential',
      installationId: '77',
      state: 'state-artificial-com-mais-de-trinta-caracteres'
    };
    for (const record of [
      { expiresAt: new Date(Date.now() - 1000), usedAt: null },
      { expiresAt: new Date(Date.now() + 1000), usedAt: new Date() }
    ]) {
      mocks.repository.findConnectionState.mockResolvedValue(validStateRecord(record));
      await expect(githubAppService.completeCallback(callback)).rejects.toMatchObject({
        statusCode: 403
      });
    }

    mocks.repository.findConnectionState.mockResolvedValue(validStateRecord());
    const metadata = {
      githubInstallationId: '77',
      accountId: '700',
      accountLogin: 'traceflow',
      accountType: 'Organization',
      installedAt: new Date('2030-01-01T00:00:00Z')
    };
    mocks.credentialProvider.exchangeInstallationUserCode.mockResolvedValue('token-efemero');
    mocks.credentialProvider.listInstallationsAccessibleToUser.mockResolvedValue([
      { ...metadata, githubInstallationId: '76' },
      metadata
    ]);
    mocks.logger.info.mockClear();
    mocks.repository.authorizeInstallationFromState.mockResolvedValue({
      installation: {
        id: 12,
        githubInstallationId: '77',
        accountLogin: 'traceflow',
        accountType: 'Organization',
        status: 'ACTIVE'
      },
      authorization: { id: 30, installationId: 12, userId: 7 }
    });
    await expect(githubAppService.completeCallback(callback)).resolves.toMatchObject({
      installation: { githubInstallationId: '77' }
    });
    expect(mocks.credentialProvider.listInstallationsAccessibleToUser).toHaveBeenCalledWith(
      'token-efemero'
    );
    expect(mocks.repository.authorizeInstallationFromState).toHaveBeenCalledWith(
      expect.objectContaining({ stateId: 1, userId: 7 })
    );
    expect(
      JSON.stringify(mocks.repository.authorizeInstallationFromState.mock.calls)
    ).not.toContain('token-efemero');
    expect(mocks.logger.info.mock.calls.map(([, context]) => context.step)).toEqual([
      'validate_state',
      'exchange_code',
      'list_user_installations',
      'validate_installation',
      'upsert_installation',
      'upsert_authorization',
      'consume_state'
    ]);
    expect(JSON.stringify(mocks.logger.info.mock.calls)).not.toMatch(
      /token-efemero|state-artificial|oauth-code-confidential/
    );

    mocks.repository.authorizeInstallationFromState.mockResolvedValueOnce(null);
    await expect(githubAppService.completeCallback(callback)).rejects.toMatchObject({
      statusCode: 403
    });
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
      selectable: true
    });
    expect(listed[2]).toMatchObject({ availability: 'AVAILABLE', selectable: true });
  });

  it('agrega instalações, deduplica repositórios e mantém a instalação apenas como metadata interna', async () => {
    mocks.repository.listAuthorizedInstallations.mockResolvedValue([
      { id: 1, githubInstallationId: '77', accountLogin: 'pessoa' },
      { id: 2, githubInstallationId: '88', accountLogin: 'organizacao' }
    ]);
    mocks.clientFactory.forInstallation.mockImplementation(async (installationId) => ({
      listRepositoryPages: () =>
        (async function* repositoryPages() {
          yield [
            {
              githubRepositoryId: installationId === '77' ? '501' : '502',
              fullName: installationId === '77' ? 'pessoa/a' : 'organizacao/b'
            },
            ...(installationId === '88'
              ? [{ githubRepositoryId: '501', fullName: 'pessoa/a' }]
              : [])
          ];
        })()
    }));
    mocks.repository.findIntegrationsByRepositoryIds.mockResolvedValue([
      {
        githubRepositoryId: '501',
        projectId: 20,
        project: { id: 20, name: 'Projeto A', memberships: [{ id: 1 }] }
      }
    ]);

    const repositories = await githubAppService.listAllRepositories(7);

    expect(repositories).toHaveLength(2);
    expect(repositories[0]).toMatchObject({
      githubRepositoryId: '502',
      githubInstallationId: '88',
      accountLogin: 'organizacao'
    });
    expect(repositories[1]).toMatchObject({
      githubRepositoryId: '501',
      githubInstallationId: '77',
      accountLogin: 'pessoa',
      alreadyConnected: true,
      connectedProject: { id: 20, name: 'Projeto A' }
    });
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
    expect(githubAppService.verifyWebhookSignature(rawBody)).toBe(false);
    expect(githubAppService.verifyWebhookSignature(rawBody.toString(), signature)).toBe(false);
    expect(githubAppService.verifyWebhookSignature(rawBody, 'sha256=curta')).toBe(false);
  });

  it('cria, remove e reativa instalação pelos eventos assinados', async () => {
    mocks.repository.createWebhookDelivery.mockResolvedValue({ id: 20 });
    for (const action of ['created', 'deleted', 'unsuspend']) {
      const rawBody = Buffer.from(
        JSON.stringify({
          action,
          installation: {
            id: 77,
            account: { id: 700, login: 'traceflow', type: 'Organization' },
            created_at: '2030-01-01T00:00:00Z'
          }
        })
      );
      const signature = `sha256=${createHmac('sha256', 'webhook-secret-artificial').update(rawBody).digest('hex')}`;
      await githubAppService.processWebhook({
        rawBody,
        signature,
        deliveryId: `delivery-${action}`,
        event: 'installation'
      });
    }
    expect(mocks.repository.upsertInstallationFromWebhook).toHaveBeenCalledWith(
      77,
      expect.objectContaining({ id: 77 })
    );
    expect(mocks.repository.updateInstallationStatus).toHaveBeenCalledWith(77, 'DELETED');
    expect(mocks.repository.updateInstallationStatus).toHaveBeenCalledWith(77, 'ACTIVE', null);
    expect(mocks.repository.requireReconnectForInstallation).toHaveBeenCalledTimes(1);
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
