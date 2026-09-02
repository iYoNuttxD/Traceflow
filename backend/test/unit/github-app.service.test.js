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
    findIntegration: vi.fn(),
    findIntegrationByRepositoryId: vi.fn(),
    findIntegrationsByRepositoryIds: vi.fn(),
    connectProject: vi.fn(),
    startWebhookDelivery: vi.fn(),
    completeWebhookDelivery: vi.fn(),
    failWebhookDelivery: vi.fn(),
    updateInstallationStatus: vi.fn(),
    refreshInstallationMetadata: vi.fn(),
    upsertInstallationFromWebhook: vi.fn(),
    requireReconnectForInstallation: vi.fn(),
    requireReconnectForRepositories: vi.fn()
  },
  credentialProvider: {
    exchangeInstallationUserCode: vi.fn(),
    listInstallationsAccessibleToUser: vi.fn(),
    getInstallation: vi.fn()
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
    user: {
      id: 7,
      isActive: true,
      accountStatus: 'ACTIVE',
      sessionVersion: 1,
      githubIdentity: null
    },
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

function authorizedInstallation(overrides = {}) {
  return {
    id: 12,
    githubInstallationId: '77',
    ...overrides
  };
}

describe('autorização e webhooks da GitHub App L1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorization.membership.mockResolvedValue({ role: 'OWNER' });
    mocks.repository.createConnectionState.mockResolvedValue({ id: 1 });
    mocks.repository.findIntegration.mockResolvedValue(null);
    mocks.repository.findIntegrationByRepositoryId.mockResolvedValue(null);
    mocks.repository.findIntegrationsByRepositoryIds.mockResolvedValue([]);
    mocks.repository.startWebhookDelivery.mockResolvedValue({
      delivery: { id: 12 },
      duplicate: false,
      retried: false
    });
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
    mocks.credentialProvider.getInstallation.mockResolvedValue(metadata);
    const verifyRepositoryAccess = vi.fn().mockResolvedValue(undefined);
    const listRepositoryPages = vi.fn(() =>
      (async function* repositoryPages() {
        yield [{ githubRepositoryId: '501', fullName: 'traceflow/repo-1' }];
        yield [{ githubRepositoryId: '502', fullName: 'traceflow/repo-2' }];
      })()
    );
    mocks.clientFactory.forInstallation.mockResolvedValue({
      verifyRepositoryAccess,
      listRepositoryPages
    });
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
      expect.objectContaining({
        stateId: 1,
        userId: 7,
        installation: metadata
      })
    );
    expect(mocks.credentialProvider.getInstallation).toHaveBeenCalledWith('77');
    expect(mocks.clientFactory.forInstallation).toHaveBeenCalledWith('77');
    expect(verifyRepositoryAccess).toHaveBeenCalledOnce();
    expect(listRepositoryPages).not.toHaveBeenCalled();
    expect(
      JSON.stringify(mocks.repository.authorizeInstallationFromState.mock.calls)
    ).not.toContain('token-efemero');
    expect(mocks.logger.info.mock.calls.map(([, context]) => context.step)).toEqual([
      'validate_state',
      'exchange_installation_user_code',
      'validate_installation',
      'fetch_installation',
      'verify_repository_access',
      'persist_installation',
      'consume_state',
      'complete'
    ]);
    expect(JSON.stringify(mocks.logger.info.mock.calls)).not.toMatch(
      /token-efemero|state-artificial|oauth-code-confidential/
    );

    mocks.repository.authorizeInstallationFromState.mockResolvedValueOnce(null);
    await expect(githubAppService.completeCallback(callback)).rejects.toMatchObject({
      statusCode: 403
    });
  });

  it('valida conta ativa e aceita conta local sem GitHub Identity', async () => {
    const callback = {
      code: 'oauth-code-artificial',
      installationId: '77',
      state: 'state-artificial-com-mais-de-trinta-caracteres'
    };
    mocks.repository.findConnectionState.mockResolvedValue(
      validStateRecord({ user: { ...validStateRecord().user, accountStatus: 'DEACTIVATED' } })
    );
    await expect(githubAppService.completeCallback(callback)).rejects.toMatchObject({
      statusCode: 403
    });
    expect(mocks.credentialProvider.exchangeInstallationUserCode).not.toHaveBeenCalled();

    mocks.repository.findConnectionState.mockResolvedValue(validStateRecord());
    mocks.credentialProvider.exchangeInstallationUserCode.mockResolvedValue('token-efemero');
    const metadata = {
      githubInstallationId: '77',
      accountId: '700',
      accountLogin: 'traceflow',
      accountType: 'Organization',
      installedAt: new Date('2030-01-01T00:00:00Z')
    };
    mocks.credentialProvider.listInstallationsAccessibleToUser.mockResolvedValue([metadata]);
    mocks.credentialProvider.getInstallation.mockResolvedValue(metadata);
    mocks.clientFactory.forInstallation.mockResolvedValue({
      verifyRepositoryAccess: vi.fn().mockResolvedValue(undefined)
    });
    mocks.repository.authorizeInstallationFromState.mockResolvedValue({
      installation: { id: 12, ...metadata, status: 'ACTIVE' },
      authorization: { id: 30, installationId: 12, userId: 7 }
    });

    await expect(githubAppService.completeCallback(callback)).resolves.toMatchObject({
      installation: { githubInstallationId: '77' },
      userId: 7
    });
    expect(JSON.stringify(mocks.logger.warn.mock.calls)).not.toContain('token-efemero');
  });

  it.each([
    ['GITHUB_FORBIDDEN', 403],
    ['GITHUB_RATE_LIMITED', 429]
  ])(
    'interrompe o callback quando a verificação mínima falha com %s',
    async (errorCode, statusCode) => {
      const callback = {
        code: 'oauth-code-artificial',
        installationId: '77',
        state: 'state-artificial-com-mais-de-trinta-caracteres'
      };
      const metadata = {
        githubInstallationId: '77',
        accountId: '700',
        accountLogin: 'traceflow',
        accountType: 'Organization',
        installedAt: new Date('2030-01-01T00:00:00Z')
      };
      const githubError = Object.assign(new Error('Falha GitHub normalizada'), {
        code: errorCode,
        statusCode
      });
      mocks.repository.findConnectionState.mockResolvedValue(validStateRecord());
      mocks.credentialProvider.exchangeInstallationUserCode.mockResolvedValue('token-efemero');
      mocks.credentialProvider.listInstallationsAccessibleToUser.mockResolvedValue([metadata]);
      mocks.credentialProvider.getInstallation.mockResolvedValue(metadata);
      mocks.clientFactory.forInstallation.mockResolvedValue({
        verifyRepositoryAccess: vi.fn().mockRejectedValue(githubError)
      });

      await expect(githubAppService.completeCallback(callback)).rejects.toBe(githubError);
      expect(mocks.repository.authorizeInstallationFromState).not.toHaveBeenCalled();
      expect(mocks.logger.warn).toHaveBeenCalledWith(
        'Callback da GitHub App interrompido.',
        expect.objectContaining({ step: 'verify_repository_access', errorCode })
      );
      expect(JSON.stringify(mocks.logger.warn.mock.calls)).not.toContain('token-efemero');
    }
  );

  it('trata GitHubIdentity existente como metadata irrelevante para o callback da App', async () => {
    const callback = {
      code: 'oauth-code-artificial',
      installationId: '77',
      state: 'state-artificial-com-mais-de-trinta-caracteres'
    };
    const metadata = {
      githubInstallationId: '77',
      accountId: '700',
      accountLogin: 'traceflow',
      accountType: 'Organization',
      installedAt: new Date('2030-01-01T00:00:00Z')
    };
    mocks.repository.findConnectionState.mockResolvedValue(
      validStateRecord({
        user: {
          ...validStateRecord().user,
          githubIdentity: { githubUserId: '999', githubLogin: 'outra-identidade' }
        }
      })
    );
    mocks.credentialProvider.exchangeInstallationUserCode.mockResolvedValue('token-efemero');
    mocks.credentialProvider.listInstallationsAccessibleToUser.mockResolvedValue([metadata]);
    mocks.credentialProvider.getInstallation.mockResolvedValue(metadata);
    mocks.clientFactory.forInstallation.mockResolvedValue({
      verifyRepositoryAccess: vi.fn().mockResolvedValue(undefined)
    });
    mocks.repository.authorizeInstallationFromState.mockResolvedValue({
      installation: { id: 12, ...metadata, status: 'ACTIVE' },
      authorization: { id: 30, installationId: 12, userId: 7 }
    });

    await expect(githubAppService.completeCallback(callback)).resolves.toMatchObject({ userId: 7 });
  });

  it('falha fechado para state cross-user e sessão expirada ou com versão divergente', async () => {
    const callback = {
      code: 'oauth-code-artificial',
      installationId: '77',
      state: 'state-artificial-com-mais-de-trinta-caracteres'
    };
    const base = validStateRecord();
    const invalidRecords = [
      validStateRecord({ user: { ...base.user, id: 8 } }),
      validStateRecord({ session: { ...base.session, userId: 8 } }),
      validStateRecord({ session: { ...base.session, expiresAt: new Date(Date.now() - 1000) } }),
      validStateRecord({ session: { ...base.session, sessionVersion: 2 } })
    ];

    for (const record of invalidRecords) {
      mocks.repository.findConnectionState.mockResolvedValueOnce(record);
      await expect(githubAppService.completeCallback(callback)).rejects.toMatchObject({
        statusCode: 403
      });
    }
    expect(mocks.credentialProvider.exchangeInstallationUserCode).not.toHaveBeenCalled();
  });

  it.each(['SUSPENDED', 'REMOVED'])('não reativa Installation %s pelo callback', async (status) => {
    const metadata = {
      githubInstallationId: '77',
      accountId: '700',
      accountLogin: 'traceflow',
      accountType: 'Organization',
      installedAt: new Date('2030-01-01T00:00:00Z')
    };
    mocks.repository.findConnectionState.mockResolvedValue(validStateRecord());
    mocks.credentialProvider.exchangeInstallationUserCode.mockResolvedValue('token-efemero');
    mocks.credentialProvider.listInstallationsAccessibleToUser.mockResolvedValue([metadata]);
    mocks.credentialProvider.getInstallation.mockResolvedValue(metadata);
    mocks.clientFactory.forInstallation.mockResolvedValue({
      verifyRepositoryAccess: vi.fn().mockResolvedValue(undefined)
    });
    mocks.repository.authorizeInstallationFromState.mockResolvedValue({
      lifecycleBlocked: status
    });

    await expect(
      githubAppService.completeCallback({
        code: 'oauth-code-artificial',
        installationId: '77',
        state: 'state-artificial-com-mais-de-trinta-caracteres'
      })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      'Callback da GitHub App interrompido.',
      expect.objectContaining({ errorCode: `INSTALLATION_${status}` })
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
      ...authorizedInstallation()
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
    mocks.repository.findAuthorizedInstallation.mockResolvedValue(authorizedInstallation());
    const repositoryPages = vi.fn();
    mocks.clientFactory.forInstallation.mockResolvedValue({ listRepositoryPages: repositoryPages });

    repositoryPages.mockReturnValueOnce(
      (async function* emptyPages() {
        yield [];
      })()
    );
    await expect(githubAppService.listRepositories(7, 77)).resolves.toEqual({
      repositories: []
    });

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
    expect(listed.repositories).toHaveLength(3);
    expect(listed.repositories[0]).toMatchObject({ availability: 'AVAILABLE', selectable: true });
    expect(listed.repositories[1]).toMatchObject({
      availability: 'CONNECTED',
      alreadyConnected: true,
      selectable: false
    });
    expect(listed.repositories[2]).toMatchObject({ availability: 'AVAILABLE', selectable: true });
  });

  it('lista pela GitHub App sem depender de identidade OAuth ou TTL pessoal', async () => {
    mocks.repository.listAuthorizedInstallations.mockResolvedValue([authorizedInstallation()]);
    mocks.clientFactory.forInstallation.mockResolvedValue({
      listRepositoryPages: () =>
        (async function* emptyPages() {
          yield [];
        })()
    });
    await expect(githubAppService.listAllRepositories(7)).resolves.toEqual({ repositories: [] });
  });

  it('lista exatamente os repositórios concedidos à Installation', async () => {
    mocks.repository.findAuthorizedInstallation.mockResolvedValue(authorizedInstallation());
    const repositories = [
      { githubRepositoryId: '501', fullName: 'pessoa/owner' },
      { githubRepositoryId: '502', fullName: 'empresa/admin' },
      { githubRepositoryId: '503', fullName: 'empresa/write' },
      { githubRepositoryId: '504', fullName: 'empresa/read' }
    ];
    mocks.clientFactory.forInstallation.mockResolvedValue({
      listRepositoryPages: () =>
        (async function* repositoryPages() {
          yield repositories;
        })()
    });
    await expect(githubAppService.listRepositories(7, 77)).resolves.toEqual({
      repositories: [
        expect.objectContaining({ githubRepositoryId: '501' }),
        expect.objectContaining({ githubRepositoryId: '502' }),
        expect.objectContaining({ githubRepositoryId: '503' }),
        expect.objectContaining({ githubRepositoryId: '504' })
      ]
    });
  });

  it('agrega instalações, deduplica repositórios e mantém a instalação apenas como metadata interna', async () => {
    mocks.repository.listAuthorizedInstallations.mockResolvedValue([
      authorizedInstallation({ id: 1, githubInstallationId: '77', accountLogin: 'pessoa' }),
      authorizedInstallation({ id: 2, githubInstallationId: '88', accountLogin: 'organizacao' })
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

    const result = await githubAppService.listAllRepositories(7);
    const repositories = result.repositories;

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

  it('bloqueia troca de repo X por repo Y antes da chamada externa', async () => {
    mocks.repository.findIntegration.mockResolvedValue({
      projectId: 9,
      githubRepositoryId: '501'
    });

    await expect(
      githubAppService.connectProject({
        projectId: 9,
        userId: 7,
        githubInstallationId: '77',
        githubRepositoryId: '502'
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'GITHUB_REPOSITORY_SWAP_FORBIDDEN'
    });
    expect(mocks.clientFactory.forInstallation).not.toHaveBeenCalled();
    expect(mocks.repository.connectProject).not.toHaveBeenCalled();
  });

  it('revalida o repositório ao criar usando o acesso atual da Installation', async () => {
    mocks.repository.findAuthorizedInstallation.mockResolvedValue(authorizedInstallation());
    mocks.clientFactory.forInstallation.mockResolvedValue({
      listRepositoryPages: () =>
        (async function* repositoryPages() {
          yield [
            {
              githubRepositoryId: '501',
              name: 'repo',
              fullName: 'traceflow/repo',
              url: 'https://github.com/traceflow/repo',
              defaultBranch: 'main',
              private: true
            }
          ];
        })()
    });
    mocks.repository.connectProject.mockResolvedValue({ id: 14, projectId: 9 });

    await expect(
      githubAppService.connectProject({
        projectId: 9,
        userId: 7,
        githubInstallationId: '77',
        githubRepositoryId: '501'
      })
    ).resolves.toMatchObject({ id: 14, projectId: 9 });
    expect(mocks.repository.connectProject).toHaveBeenCalledWith(
      9,
      12,
      expect.objectContaining({ githubRepositoryId: '501', repositoryPrivate: true })
    );
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

    mocks.repository.startWebhookDelivery.mockResolvedValueOnce({
      delivery: null,
      duplicate: true,
      retried: false
    });
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
    expect(mocks.repository.updateInstallationStatus).toHaveBeenCalledWith(77, 'REMOVED');
    expect(mocks.repository.updateInstallationStatus).toHaveBeenCalledWith(77, 'ACTIVE', null);
    expect(mocks.repository.requireReconnectForInstallation).toHaveBeenCalledTimes(1);
  });

  it('marca instalação suspensa e seus projetos para reconexão', async () => {
    const rawBody = Buffer.from(JSON.stringify({ action: 'suspend', installation: { id: 77 } }));
    const signature = `sha256=${createHmac('sha256', 'webhook-secret-artificial').update(rawBody).digest('hex')}`;
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

  it('marca falha interna e permite retomar o mesmo delivery', async () => {
    const rawBody = Buffer.from(
      JSON.stringify({
        action: 'added',
        installation: { id: 77, account: { id: 700, login: 'traceflow' } }
      })
    );
    const signature = `sha256=${createHmac('sha256', 'webhook-secret-artificial').update(rawBody).digest('hex')}`;
    mocks.repository.refreshInstallationMetadata.mockRejectedValueOnce({
      code: 'TRANSIENT_DATABASE_FAILURE'
    });

    await expect(
      githubAppService.processWebhook({
        rawBody,
        signature,
        deliveryId: 'delivery-retry',
        event: 'installation_repositories'
      })
    ).rejects.toMatchObject({ code: 'TRANSIENT_DATABASE_FAILURE' });
    expect(mocks.repository.failWebhookDelivery).toHaveBeenCalledWith(
      12,
      'refresh_installation_metadata',
      'TRANSIENT_DATABASE_FAILURE',
      expect.any(Date)
    );

    mocks.repository.startWebhookDelivery.mockResolvedValueOnce({
      delivery: { id: 12 },
      duplicate: false,
      retried: true
    });
    await expect(
      githubAppService.processWebhook({
        rawBody,
        signature,
        deliveryId: 'delivery-retry',
        event: 'installation_repositories'
      })
    ).resolves.toEqual({ duplicate: false });
    expect(mocks.repository.completeWebhookDelivery).toHaveBeenLastCalledWith(12);
  });
});
