import { beforeEach, describe, expect, it, vi } from 'vitest';

const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock('../../src/api/http-client.js', () => ({ httpClient: client }));
const { settingsApi } = await import('../../src/features/settings/settings.api.js');

describe('contratos da API de configurações L2', () => {
  beforeEach(() => {
    for (const method of Object.values(client)) method.mockResolvedValue({ data: {} });
  });

  it('envia mudança de e-mail e senha apenas ao backend', async () => {
    client.post.mockResolvedValue({ data: { request: { id: 1 } } });
    await settingsApi.requestEmailChange('novo@example.test', 'senha-atual');
    expect(client.post).toHaveBeenCalledWith('/settings/account/email-change', {
      newEmail: 'novo@example.test',
      currentPassword: 'senha-atual'
    });
  });

  it('solicita exportação como blob ZIP', async () => {
    client.post.mockResolvedValue({ data: new Blob(['PK']) });
    await settingsApi.exportData();
    expect(client.post).toHaveBeenCalledWith(
      '/settings/privacy/export',
      {},
      { responseType: 'blob' }
    );
  });

  it('remove somente a autorização GitHub selecionada com confirmação de senha', async () => {
    await settingsApi.removeGithubAuthorization(12, 'senha-atual');
    expect(client.delete).toHaveBeenCalledWith('/settings/integrations/github/authorizations/12', {
      data: { currentPassword: 'senha-atual', confirmation: true }
    });
  });

  it('inicia a autorização GitHub pela área de integrações', async () => {
    await settingsApi.startGithubInstallation();
    expect(client.post).toHaveBeenCalledWith('/github/app/installations/start', {
      intendedAction: 'CREATE_PROJECT'
    });
  });

  it('mantém identidade GitHub separada da autorização de instalação', async () => {
    await settingsApi.startGithubIdentityLink('senha-atual');
    expect(client.post).toHaveBeenCalledWith('/settings/integrations/github-identity/link/start', {
      password: 'senha-atual'
    });
    await settingsApi.unlinkGithubIdentity('senha-atual');
    expect(client.delete).toHaveBeenCalledWith('/settings/integrations/github-identity', {
      data: { currentPassword: 'senha-atual', confirmation: true }
    });
  });

  it('inicializa a primeira senha em endpoint dedicado', async () => {
    const data = { newPassword: 'SenhaNovaSegura123!', confirmation: 'SenhaNovaSegura123!' };
    await settingsApi.initializePassword(data);
    expect(client.post).toHaveBeenCalledWith('/settings/security/password/initialize', data);
  });
});
