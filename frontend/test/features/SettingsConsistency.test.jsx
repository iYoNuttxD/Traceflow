import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../../src/shared/index.js';

const mocks = vi.hoisted(() => ({
  auth: { refresh: vi.fn() },
  authApi: { startGithubSensitiveReauthentication: vi.fn() },
  api: {
    account: vi.fn(),
    updateProfile: vi.fn(),
    updateUsername: vi.fn(),
    requestEmailChange: vi.fn(),
    cancelEmailChange: vi.fn(),
    deactivate: vi.fn(),
    sessions: vi.fn(),
    deletion: vi.fn(),
    requestDeletion: vi.fn(),
    cancelDeletion: vi.fn(),
    exportData: vi.fn(),
    github: vi.fn(),
    githubIdentity: vi.fn(),
    startGithubIdentityLink: vi.fn(),
    unlinkGithubIdentity: vi.fn(),
    startGithubInstallation: vi.fn(),
    removeGithubAuthorization: vi.fn()
  }
}));

vi.mock('../../src/features/settings/settings.api.js', () => ({ settingsApi: mocks.api }));
vi.mock('../../src/features/auth/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => mocks.auth,
  authApi: mocks.authApi
}));

const { AccountSettingsPage } = await import('../../src/features/settings/AccountSettingsPage.jsx');
const { PrivacySettingsPage } = await import('../../src/features/settings/PrivacySettingsPage.jsx');
const { SecuritySettingsPage } =
  await import('../../src/features/settings/SecuritySettingsPage.jsx');
const { IntegrationsSettingsPage } =
  await import('../../src/features/settings/IntegrationsSettingsPage.jsx');

const account = Object.freeze({
  id: 7,
  name: 'Daniel',
  username: 'daniel',
  email: 'daniel@example.invalid',
  accountStatus: 'ACTIVE',
  pendingEmailChange: null,
  nextUsernameChangeAt: null,
  hasLocalPassword: true,
  hasGithubIdentity: true,
  recentlyReauthenticated: false
});

function githubAuthorization(projects = [{ id: 20 }]) {
  return {
    id: 12,
    installation: {
      accountLogin: 'traceflow-org',
      accountType: 'Organization',
      status: 'ACTIVE',
      manageUrl: 'https://github.com/settings/installations/12'
    },
    repositories: [{ id: 1 }],
    projects
  };
}

function apiError(status, message, retryAfterSeconds) {
  return {
    response: {
      status,
      data: {
        code: status === 429 ? 'RATE_LIMITED' : 'OPERATION_FAILED',
        message,
        ...(retryAfterSeconds ? { retryAfterSeconds } : {})
      }
    }
  };
}

async function renderAccount() {
  render(
    <MemoryRouter>
      <ConfirmProvider>
        <AccountSettingsPage />
      </ConfirmProvider>
    </MemoryRouter>
  );
  await screen.findByLabelText('Nome');
}

async function changeProfile(user, { name, username }) {
  if (name !== undefined) {
    await user.clear(screen.getByLabelText('Nome'));
    await user.type(screen.getByLabelText('Nome'), name);
  }
  if (username !== undefined) {
    await user.clear(screen.getByLabelText('Username'));
    await user.type(screen.getByLabelText('Username'), username);
  }
  await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
}

describe('Settings consistency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.refresh.mockResolvedValue();
    mocks.api.account.mockResolvedValue(account);
    mocks.api.updateProfile.mockResolvedValue({});
    mocks.api.updateUsername.mockResolvedValue({});
    mocks.api.sessions.mockResolvedValue([]);
    mocks.api.deletion.mockResolvedValue(null);
    mocks.api.requestDeletion.mockResolvedValue({});
    mocks.api.cancelDeletion.mockResolvedValue({});
    mocks.api.exportData.mockResolvedValue(new Blob());
    mocks.api.github.mockResolvedValue([]);
    mocks.api.githubIdentity.mockResolvedValue({ linked: false });
    mocks.api.unlinkGithubIdentity.mockResolvedValue({});
    mocks.api.removeGithubAuthorization.mockResolvedValue({});
    mocks.api.startGithubInstallation.mockResolvedValue({
      data: { url: 'https://github.example/install' }
    });
    mocks.authApi.startGithubSensitiveReauthentication.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it('foca a seção OAuth estável após o unlink remover o trigger', async () => {
    const user = userEvent.setup();
    mocks.api.githubIdentity
      .mockResolvedValueOnce({ linked: true, githubLogin: 'octocat' })
      .mockResolvedValue({ linked: false });
    render(
      <MemoryRouter>
        <IntegrationsSettingsPage />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'Desvincular' }));
    const dialog = screen.getByRole('dialog', { name: 'Desvincular GitHub OAuth?' });
    await user.type(within(dialog).getByLabelText(/Senha atual/), 'senha local segura');
    await user.click(within(dialog).getByRole('button', { name: 'Desvincular' }));

    expect(
      await screen.findByRole('button', { name: 'Vincular GitHub OAuth' })
    ).toBeInTheDocument();
    const heading = screen.getByRole('heading', { name: 'GitHub OAuth' });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.queryByRole('button', { name: 'Desvincular' })).not.toBeInTheDocument();
  });

  it('restaura o impacto e foca a seção App após disconnect remover o trigger', async () => {
    const user = userEvent.setup();
    mocks.api.github
      .mockResolvedValueOnce([githubAuthorization([{ id: 20 }, { id: 21 }])])
      .mockResolvedValue([]);
    render(
      <MemoryRouter>
        <IntegrationsSettingsPage />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'Desconectar' }));
    const dialog = screen.getByRole('dialog', { name: 'Desconectar GitHub App?' });
    expect(dialog).toHaveTextContent('Esta autorização está vinculada a 2 projetos.');
    expect(dialog).toHaveTextContent('O login com GitHub não será afetado.');
    await user.type(within(dialog).getByLabelText(/Senha atual/), 'senha local segura');
    await user.click(within(dialog).getByRole('button', { name: 'Desconectar' }));

    expect(await screen.findByText('GitHub App não instalada')).toBeInTheDocument();
    const heading = screen.getByRole('heading', { name: 'GitHub App' });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.queryByRole('button', { name: 'Desconectar' })).not.toBeInTheDocument();
  });

  it('mantém 429 visível no dialog e na página, bloqueia retry e libera no expiry', async () => {
    vi.useFakeTimers();
    mocks.api.github.mockResolvedValue([githubAuthorization()]);
    mocks.api.removeGithubAuthorization.mockRejectedValue(
      apiError(429, 'Muitas tentativas realizadas.', 3)
    );
    render(
      <MemoryRouter>
        <IntegrationsSettingsPage />
      </MemoryRouter>
    );
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Desconectar' }));
    const dialog = screen.getByRole('dialog', { name: 'Desconectar GitHub App?' });
    fireEvent.change(within(dialog).getByLabelText(/Senha atual/), {
      target: { value: 'senha local segura' }
    });
    const confirm = within(dialog).getByRole('button', { name: 'Desconectar' });
    await act(async () => {
      fireEvent.click(confirm);
      await Promise.resolve();
    });

    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Muitas tentativas realizadas. Tente novamente em 3s.'
    );
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(mocks.api.removeGithubAuthorization).toHaveBeenCalledOnce();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Tente novamente em 3s.');
    const trigger = screen.getByRole('button', { name: 'Desconectar' });
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(trigger);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    for (let second = 0; second < 3; second += 1) {
      await act(async () => vi.advanceTimersByTime(1000));
    }
    expect(trigger).not.toHaveAttribute('aria-disabled');
  });

  it('aplica o mesmo 429 ao fluxo de vincular OAuth', async () => {
    const user = userEvent.setup();
    mocks.api.startGithubIdentityLink.mockRejectedValue(
      apiError(429, 'Limite de vínculo atingido.', 12)
    );
    render(
      <MemoryRouter>
        <IntegrationsSettingsPage />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'Vincular GitHub OAuth' }));
    const dialog = screen.getByRole('dialog', { name: 'Vincular GitHub OAuth' });
    await user.type(within(dialog).getByLabelText(/Senha atual/), 'senha local segura');
    const confirm = within(dialog).getByRole('button', { name: 'Continuar com GitHub' });
    await user.click(confirm);

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Limite de vínculo atingido. Tente novamente em 12s.'
    );
    expect(confirm).toBeDisabled();
    await user.click(confirm);
    expect(mocks.api.startGithubIdentityLink).toHaveBeenCalledOnce();
  });

  it('propaga o cooldown da reautenticação GitHub do disconnect', async () => {
    const user = userEvent.setup();
    mocks.api.account.mockResolvedValue({
      ...account,
      hasLocalPassword: false,
      hasGithubIdentity: true,
      recentlyReauthenticated: false
    });
    mocks.api.github.mockResolvedValue([githubAuthorization()]);
    mocks.authApi.startGithubSensitiveReauthentication.mockRejectedValue(
      apiError(429, 'Confirmações temporariamente limitadas.', 9)
    );
    render(
      <MemoryRouter>
        <IntegrationsSettingsPage />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'Desconectar' }));
    const dialog = screen.getByRole('dialog', { name: 'Desconectar GitHub App?' });
    await user.click(
      within(dialog).getByRole('button', { name: 'Confirmar identidade com GitHub' })
    );

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Confirmações temporariamente limitadas. Tente novamente em 9s.'
    );
    expect(
      within(dialog).getByRole('button', { name: 'Confirmar identidade em 9s' })
    ).toBeDisabled();
    expect(mocks.authApi.startGithubSensitiveReauthentication).toHaveBeenCalledOnce();
  });

  it.each([
    ['Account', AccountSettingsPage, 2],
    ['Privacy', PrivacySettingsPage, 1],
    ['Security', SecuritySettingsPage, 1]
  ])(
    'preserva e expira o cooldown da reautenticação GitHub em %s',
    async (_name, Page, expectedButtons) => {
      mocks.api.account.mockResolvedValue({
        ...account,
        hasLocalPassword: false,
        hasGithubIdentity: true,
        recentlyReauthenticated: false,
        canInitializePassword: false
      });
      mocks.authApi.startGithubSensitiveReauthentication
        .mockRejectedValueOnce(apiError(429, 'Confirmações temporariamente limitadas.', 3))
        .mockImplementationOnce(() => new Promise(() => {}));
      render(
        <MemoryRouter>
          <ConfirmProvider>
            <Page />
          </ConfirmProvider>
        </MemoryRouter>
      );

      const initialButtons = await screen.findAllByRole('button', {
        name: 'Confirmar identidade com GitHub'
      });
      expect(initialButtons).toHaveLength(expectedButtons);
      vi.useFakeTimers();
      await act(async () => {
        fireEvent.click(initialButtons[0]);
        await Promise.resolve();
      });

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Confirmações temporariamente limitadas.'
      );
      expect(screen.getByRole('alert')).toHaveTextContent('Tente novamente em 3s.');
      const limitedButtons = screen.getAllByRole('button', {
        name: 'Confirmar identidade em 3s'
      });
      expect(limitedButtons).toHaveLength(expectedButtons);
      limitedButtons.forEach((button) => expect(button).toBeDisabled());
      fireEvent.click(limitedButtons[0]);
      expect(mocks.authApi.startGithubSensitiveReauthentication).toHaveBeenCalledOnce();

      for (let second = 0; second < 3; second += 1) {
        await act(async () => vi.advanceTimersByTime(1000));
      }
      const retryButtons = screen.getAllByRole('button', {
        name: 'Confirmar identidade com GitHub'
      });
      retryButtons.forEach((button) => expect(button).toBeEnabled());
      fireEvent.click(retryButtons[0]);
      expect(mocks.authApi.startGithubSensitiveReauthentication).toHaveBeenCalledTimes(2);
    }
  );

  it('mantém mutation failure no dialog sem marcar unlink como concluído', async () => {
    const user = userEvent.setup();
    mocks.api.githubIdentity.mockResolvedValue({ linked: true, githubLogin: 'octocat' });
    mocks.api.unlinkGithubIdentity.mockRejectedValue(apiError(409, 'Vínculo já foi alterado.'));
    render(
      <MemoryRouter>
        <IntegrationsSettingsPage />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'Desvincular' }));
    const dialog = screen.getByRole('dialog', { name: 'Desvincular GitHub OAuth?' });
    await user.type(within(dialog).getByLabelText(/Senha atual/), 'senha local segura');
    await user.click(within(dialog).getByRole('button', { name: 'Desvincular' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Vínculo já foi alterado.');
    expect(screen.queryByText('GitHub OAuth desvinculado.')).not.toBeInTheDocument();
    expect(mocks.api.account).toHaveBeenCalledOnce();
  });

  it('separa unlink concluído de refresh falho e recupera apenas a leitura', async () => {
    const user = userEvent.setup();
    mocks.api.account
      .mockResolvedValueOnce(account)
      .mockRejectedValueOnce(apiError(503, 'Falha transitória.'))
      .mockResolvedValue(account);
    mocks.api.githubIdentity
      .mockResolvedValueOnce({ linked: true, githubLogin: 'octocat' })
      .mockResolvedValue({ linked: false });
    render(
      <MemoryRouter>
        <IntegrationsSettingsPage />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'Desvincular' }));
    const dialog = screen.getByRole('dialog', { name: 'Desvincular GitHub OAuth?' });
    await user.type(within(dialog).getByLabelText(/Senha atual/), 'senha local segura');
    await user.click(within(dialog).getByRole('button', { name: 'Desvincular' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'GitHub OAuth desvinculado. Não foi possível atualizar os dados exibidos.'
    );
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'GitHub OAuth' })).toHaveFocus()
    );
    const staleTrigger = screen.getByRole('button', { name: 'Desvincular' });
    expect(staleTrigger).toHaveAttribute('aria-disabled', 'true');
    await user.click(staleTrigger);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.api.unlinkGithubIdentity).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Tentar atualizar integrações' }));
    expect(mocks.api.unlinkGithubIdentity).toHaveBeenCalledOnce();
    expect(
      await screen.findByRole('button', { name: 'Vincular GitHub OAuth' })
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Não foi possível atualizar os dados exibidos/)
    ).not.toBeInTheDocument();
  });

  it('separa disconnect concluído de refresh falho e recupera apenas a leitura', async () => {
    const user = userEvent.setup();
    mocks.api.account
      .mockResolvedValueOnce(account)
      .mockRejectedValueOnce(apiError(503, 'Falha transitória.'))
      .mockResolvedValue(account);
    mocks.api.github.mockResolvedValueOnce([githubAuthorization()]).mockResolvedValue([]);
    render(
      <MemoryRouter>
        <IntegrationsSettingsPage />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'Desconectar' }));
    const dialog = screen.getByRole('dialog', { name: 'Desconectar GitHub App?' });
    await user.type(within(dialog).getByLabelText(/Senha atual/), 'senha local segura');
    await user.click(within(dialog).getByRole('button', { name: 'Desconectar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'GitHub App desconectada desta conta TraceFlow. Não foi possível atualizar os dados exibidos.'
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: 'GitHub App' })).toHaveFocus());
    const staleTrigger = screen.getByRole('button', { name: 'Desconectar' });
    expect(staleTrigger).toHaveAttribute('aria-disabled', 'true');
    await user.click(staleTrigger);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.api.removeGithubAuthorization).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Tentar atualizar integrações' }));
    expect(mocks.api.removeGithubAuthorization).toHaveBeenCalledOnce();
    expect(await screen.findByText('GitHub App não instalada')).toBeInTheDocument();
    expect(
      screen.queryByText(/Não foi possível atualizar os dados exibidos/)
    ).not.toBeInTheDocument();
  });

  it('recarrega o estado canônico quando nome e username são salvos', async () => {
    const user = userEvent.setup();
    mocks.api.account
      .mockResolvedValueOnce(account)
      .mockResolvedValue({ ...account, name: 'Daniel Novo', username: 'daniel.novo' });
    await renderAccount();
    await changeProfile(user, { name: 'Daniel Novo', username: 'daniel.novo' });

    expect(await screen.findByText('Alterações salvas.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toHaveValue('Daniel Novo');
    expect(screen.getByLabelText('Username')).toHaveValue('daniel.novo');
    expect(mocks.api.account).toHaveBeenCalledTimes(2);
  });

  it('comunica nome salvo e username rejeitado após reload canônico', async () => {
    const user = userEvent.setup();
    mocks.api.account.mockResolvedValueOnce(account).mockResolvedValue({
      ...account,
      name: 'Daniel Novo',
      nextUsernameChangeAt: '2030-02-01T00:00:00.000Z'
    });
    mocks.api.updateUsername.mockRejectedValue(apiError(429, 'O username está em cooldown.', 30));
    await renderAccount();
    await changeProfile(user, { name: 'Daniel Novo', username: 'daniel.novo' });

    const feedback = await screen.findByRole('alert');
    expect(feedback).toHaveTextContent('Nome atualizado.');
    expect(feedback).toHaveTextContent(
      'Não foi possível alterar o username: O username está em cooldown.'
    );
    expect(screen.getByLabelText('Nome')).toHaveValue('Daniel Novo');
    expect(screen.getByLabelText('Username')).toHaveValue('daniel');
    expect(screen.getByText(/Nova alteração disponível/)).toBeInTheDocument();
    expect(mocks.api.account).toHaveBeenCalledTimes(2);
  });

  it('comunica username salvo e nome rejeitado após reload canônico', async () => {
    const user = userEvent.setup();
    mocks.api.account
      .mockResolvedValueOnce(account)
      .mockResolvedValue({ ...account, username: 'daniel.novo' });
    mocks.api.updateProfile.mockRejectedValue(apiError(409, 'O nome foi rejeitado.'));
    await renderAccount();
    await changeProfile(user, { name: 'Nome inválido', username: 'daniel.novo' });

    const feedback = await screen.findByRole('alert');
    expect(feedback).toHaveTextContent('Username atualizado.');
    expect(feedback).toHaveTextContent('Não foi possível alterar o nome: O nome foi rejeitado.');
    expect(screen.getByLabelText('Nome')).toHaveValue('Daniel');
    expect(screen.getByLabelText('Username')).toHaveValue('daniel.novo');
    expect(mocks.api.account).toHaveBeenCalledTimes(2);
  });

  it('recarrega o estado canônico e apresenta os dois erros quando ambas falham', async () => {
    const user = userEvent.setup();
    mocks.api.updateProfile.mockRejectedValue(apiError(409, 'Nome indisponível.'));
    mocks.api.updateUsername.mockRejectedValue(apiError(409, 'Username indisponível.'));
    await renderAccount();
    await changeProfile(user, { name: 'Outro Nome', username: 'outro.username' });

    const feedback = await screen.findByRole('alert');
    expect(feedback).toHaveTextContent('Não foi possível alterar o nome: Nome indisponível.');
    expect(feedback).toHaveTextContent(
      'Não foi possível alterar o username: Username indisponível.'
    );
    expect(screen.getByLabelText('Nome')).toHaveValue('Daniel');
    expect(screen.getByLabelText('Username')).toHaveValue('daniel');
    expect(mocks.api.account).toHaveBeenCalledTimes(2);
  });
});
