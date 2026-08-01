import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  service: {
    startInstallation: vi.fn(),
    completeCallback: vi.fn(),
    listInstallations: vi.fn(),
    listRepositories: vi.fn(),
    connectProject: vi.fn(),
    processWebhook: vi.fn()
  },
  audit: { recordOperational: vi.fn() }
}));

vi.mock('../../src/config/env.js', () => ({
  env: {
    frontendUrl: 'http://frontend.test',
    githubAppFrontendSuccessUrl: 'http://frontend.test/projects?github=connected',
    githubAppFrontendErrorUrl: 'http://frontend.test/projects?github=error'
  }
}));
vi.mock('../../src/modules/github/github-app.service.js', () => ({
  githubAppService: mocks.service
}));
vi.mock('../../src/modules/audit/audit.service.js', () => ({ auditService: mocks.audit }));

const { githubAppController, githubWebhookController } =
  await import('../../src/modules/github/github-app.controller.js');

function responseDouble() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis()
  };
}

async function invoke(handler, req = {}) {
  const res = responseDouble();
  const next = vi.fn();
  await handler(req, res, next);
  expect(next).not.toHaveBeenCalled();
  return res;
}

describe('controllers da GitHub App L1', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inicia instalação e lista instalações/repositórios autorizados', async () => {
    const auth = { user: { id: 7 }, session: { id: 8 } };
    mocks.service.startInstallation.mockResolvedValue({ url: 'https://github.test/install' });
    const started = await invoke(githubAppController.start, {
      auth,
      body: { intendedAction: 'CREATE_PROJECT' }
    });
    expect(mocks.service.startInstallation).toHaveBeenCalledWith({
      user: auth.user,
      session: auth.session,
      intendedAction: 'CREATE_PROJECT'
    });
    expect(started.json).toHaveBeenCalledWith({ url: 'https://github.test/install' });

    mocks.service.listInstallations.mockResolvedValue([{ id: 1 }]);
    const installations = await invoke(githubAppController.listInstallations, { auth });
    expect(installations.json).toHaveBeenCalledWith({ installations: [{ id: 1 }] });

    mocks.service.listRepositories.mockResolvedValue([{ id: 2 }]);
    const repositories = await invoke(githubAppController.listRepositories, {
      auth,
      params: { installationId: '77' }
    });
    expect(mocks.service.listRepositories).toHaveBeenCalledWith(7, '77', undefined);
    expect(repositories.json).toHaveBeenCalledWith({ repositories: [{ id: 2 }] });
  });

  it('conclui callback, registra auditoria e preserva contexto no redirect', async () => {
    mocks.service.completeCallback.mockResolvedValue({
      installation: { id: 12, githubInstallationId: '77' },
      intendedAction: 'CONNECT_PROJECT',
      projectId: 9
    });
    const res = await invoke(githubAppController.callback, {
      auth: { user: { id: 7 }, session: { id: 8 } },
      query: { code: 'code', installation_id: '77', state: 'state' },
      requestId: 'request-1'
    });
    const redirect = new URL(res.redirect.mock.calls[0][1]);
    expect(res.redirect.mock.calls[0][0]).toBe(303);
    expect(redirect.searchParams.get('installationId')).toBe('77');
    expect(redirect.searchParams.get('projectId')).toBe('9');
    expect(mocks.audit.recordOperational).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'GITHUB_APP_INSTALLATION_AUTHORIZED', resourceId: 12 })
    );
  });

  it('redireciona callback inválido com código público e fallback seguro', async () => {
    mocks.service.completeCallback.mockRejectedValue({ code: 'INVALID_STATE' });
    const res = await invoke(githubAppController.callback, {
      auth: { user: { id: 7 }, session: { id: 8 } },
      query: {}
    });
    expect(res.redirect.mock.calls[0][0]).toBe(303);
    expect(new URL(res.redirect.mock.calls[0][1]).searchParams.get('reason')).toBe('INVALID_STATE');
  });

  it('conecta projeto como OWNER e audita a integração', async () => {
    mocks.service.connectProject.mockResolvedValue({ id: 14, status: 'ACTIVE' });
    const res = await invoke(githubAppController.connectProject, {
      auth: { user: { id: 7 } },
      params: { projectId: '9' },
      body: { githubInstallationId: '77', githubRepositoryId: '501' },
      requestId: 'request-2'
    });
    expect(mocks.service.connectProject).toHaveBeenCalledWith({
      projectId: '9',
      userId: 7,
      githubInstallationId: '77',
      githubRepositoryId: '501'
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ integration: { id: 14, status: 'ACTIVE' } })
    );
    expect(mocks.audit.recordOperational).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'GITHUB_PROJECT_CONNECTED', resourceId: 14 })
    );
  });

  it('aceita webhook novo com 202 e duplicado com 200', async () => {
    const req = {
      body: Buffer.from('{}'),
      get: vi.fn(
        (header) =>
          ({
            'X-Hub-Signature-256': 'sha256=signature',
            'X-GitHub-Delivery': 'delivery-1',
            'X-GitHub-Event': 'installation'
          })[header]
      )
    };
    mocks.service.processWebhook.mockResolvedValueOnce({ duplicate: false });
    const accepted = await invoke(githubWebhookController.handle, req);
    expect(accepted.status).toHaveBeenCalledWith(202);
    expect(accepted.json).toHaveBeenCalledWith({ accepted: true, duplicate: false });

    mocks.service.processWebhook.mockResolvedValueOnce({ duplicate: true });
    const duplicate = await invoke(githubWebhookController.handle, req);
    expect(duplicate.status).toHaveBeenCalledWith(200);
    expect(duplicate.json).toHaveBeenCalledWith({ accepted: true, duplicate: true });
  });
});
