import { StrictMode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { user: null, logout: vi.fn(), refresh: vi.fn() },
  authApi: { startGithubSensitiveReauthentication: vi.fn() },
  confirm: vi.fn(),
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
    initializePassword: vi.fn(),
    changePassword: vi.fn(),
    revokeSession: vi.fn(),
    revokeOtherSessions: vi.fn(),
    removeGithubAuthorization: vi.fn(),
    startGithubInstallation: vi.fn(),
    confirmEmail: vi.fn(),
    confirmReactivation: vi.fn(),
    startReactivation: vi.fn()
  }
}));

vi.mock('../../src/features/auth/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => mocks.auth,
  authApi: mocks.authApi,
  PasswordField: ({ id, label, value, onChange, disabled, error }) => (
    <div>
      <label htmlFor={id}>
        {label}
        <input id={id} value={value} onChange={onChange} disabled={disabled} type="password" />
      </label>
      {error && <span role="alert">{error}</span>}
    </div>
  )
}));
vi.mock('../../src/features/settings/settings.api.js', () => ({ settingsApi: mocks.api }));
vi.mock('../../src/shared/index.js', () => ({
  normalizeApiError: (value) => ({ message: value?.message || 'Falha' }),
  classifyPageError: (value) => (value?.status === 404 ? 'NOT_FOUND' : 'SERVER'),
  getErrorRequestId: (value) => value?.requestId,
  ContextualErrorPage: ({ type, onRetry }) => (
    <section data-testid="contextual-error-page" data-error-type={type}>
      <h1>O TRACEFLOW encontrou um problema.</h1>
      <button type="button" onClick={onRetry}>
        Tentar novamente
      </button>
      <a href="/projects">Ir para projetos</a>
    </section>
  ),
  useConfirm: () => mocks.confirm,
  useCountdown: (seconds) => seconds,
  LoadingState: ({ message }) => <p>{message}</p>,
  TraceFlowIcon: ({ name }) => <svg data-icon={name} />,
  FeedbackRegion: ({ error, success }) => <div>{error || success}</div>,
  PublicPageShell: ({ children }) => <main>{children}</main>,
  StatusSurface: ({ title, description, actions, children, role }) => (
    <section role={role}>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
      {actions}
    </section>
  )
}));

const { RestrictedAccountPage } =
  await import('../../src/features/settings/RestrictedAccountPage.jsx');
const { SettingsLayout } = await import('../../src/features/settings/SettingsLayout.jsx');
const { AccountSettingsPage } = await import('../../src/features/settings/AccountSettingsPage.jsx');
const { SecuritySettingsPage } =
  await import('../../src/features/settings/SecuritySettingsPage.jsx');
const { PrivacySettingsPage } = await import('../../src/features/settings/PrivacySettingsPage.jsx');
const { IntegrationsSettingsPage } =
  await import('../../src/features/settings/IntegrationsSettingsPage.jsx');
const { ConfirmationPage } = await import('../../src/features/settings/ConfirmationPage.jsx');

describe('configurações e estados restritos L2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.user = { id: 7, name: 'Daniel', accountStatus: 'DEACTIVATED' };
    mocks.auth.refresh.mockResolvedValue();
    mocks.confirm.mockResolvedValue(true);
    mocks.api.startReactivation.mockResolvedValue({});
    mocks.api.account.mockResolvedValue({
      id: 7,
      name: 'Daniel',
      username: 'daniel',
      email: 'daniel@example.invalid',
      accountStatus: 'ACTIVE',
      pendingEmailChange: null,
      nextUsernameChangeAt: null,
      hasLocalPassword: true,
      hasGithubIdentity: false,
      recentlyReauthenticated: false,
      canInitializePassword: false
    });
    mocks.api.updateProfile.mockResolvedValue({});
    mocks.api.updateUsername.mockResolvedValue({});
    mocks.api.requestEmailChange.mockResolvedValue({});
    mocks.api.cancelEmailChange.mockResolvedValue({});
    mocks.api.deactivate.mockResolvedValue({});
    mocks.api.sessions.mockResolvedValue([
      {
        sessionId: 'b6360643-0216-4cb7-873b-4e851250f524',
        current: true,
        lastSeenAt: '2030-01-01T00:00:00.000Z'
      }
    ]);
    mocks.api.deletion.mockResolvedValue(null);
    mocks.api.requestDeletion.mockResolvedValue({});
    mocks.api.cancelDeletion.mockResolvedValue({});
    mocks.api.exportData.mockResolvedValue(new Blob());
    mocks.api.github.mockResolvedValue([]);
    mocks.api.githubIdentity.mockResolvedValue({ linked: false });
    mocks.api.removeGithubAuthorization.mockResolvedValue({});
    mocks.api.startGithubInstallation.mockResolvedValue({
      data: { url: 'https://github.example/install' }
    });
    mocks.api.confirmEmail.mockResolvedValue({});
    mocks.api.confirmReactivation.mockResolvedValue({});
    mocks.api.initializePassword.mockResolvedValue({});
    mocks.api.changePassword.mockResolvedValue({});
    mocks.api.revokeSession.mockResolvedValue({});
    mocks.api.revokeOtherSessions.mockResolvedValue({});
  });

  it('oferece reativação por e-mail para conta desativada', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <RestrictedAccountPage />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: 'Conta desativada' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enviar link de reativação' }));
    expect(mocks.api.startReactivation).toHaveBeenCalledOnce();
    expect(screen.getByText(/Enviamos um link/)).toBeInTheDocument();
  });

  it('oferece exportação e cancelamento quando a exclusão está pendente', () => {
    mocks.auth.user = { id: 7, name: 'Daniel', accountStatus: 'DELETION_PENDING' };
    render(
      <MemoryRouter>
        <RestrictedAccountPage />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: 'Exclusão pendente' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gerenciar exclusão e exportação' })).toHaveAttribute(
      'href',
      '/settings/privacy'
    );
  });

  it('expõe navegação separada para conta, segurança, privacidade e integrações', () => {
    render(
      <MemoryRouter>
        <SettingsLayout />
      </MemoryRouter>
    );
    expect(screen.getByRole('navigation', { name: 'Configurações da conta' })).toBeInTheDocument();
    for (const name of ['Conta', 'Segurança', 'Privacidade', 'Integrações']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
  });

  it('carrega e atualiza o perfil sem alterar e-mail diretamente', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AccountSettingsPage />
      </MemoryRouter>
    );
    const name = await screen.findByLabelText('Nome');
    await user.clear(name);
    await user.type(name, 'Daniel Atualizado');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(mocks.api.updateProfile).toHaveBeenCalledWith('Daniel Atualizado');
    expect(mocks.api.updateUsername).not.toHaveBeenCalled();
    expect(await screen.findByText('Alterações salvas.')).toBeInTheDocument();
    expect(screen.getByText(/daniel@example.invalid/)).toBeInTheDocument();
  });

  it('usa a página contextual quando a conta falha de forma fatal', async () => {
    mocks.api.account.mockRejectedValueOnce({ message: 'Falha interna', status: 500 });
    render(
      <MemoryRouter initialEntries={['/settings/account']}>
        <AccountSettingsPage />
      </MemoryRouter>
    );

    expect(await screen.findByTestId('contextual-error-page')).toHaveAttribute(
      'data-error-type',
      'SERVER'
    );
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir para projetos' })).toBeInTheDocument();
  });

  it('lista sessão atual sem token e apresenta formulário de senha', async () => {
    render(
      <MemoryRouter>
        <SecuritySettingsPage />
      </MemoryRouter>
    );
    expect(await screen.findByText('Este dispositivo')).toBeInTheDocument();
    expect(screen.getByLabelText('Nova senha')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/tokenHash|csrfToken/);
  });

  it('recupera a tela de segurança de uma falha fatal somente após retry explícito', async () => {
    const user = userEvent.setup();
    mocks.api.account.mockRejectedValueOnce({ message: 'Falha interna', status: 500 });
    render(
      <MemoryRouter initialEntries={['/settings/security']}>
        <SecuritySettingsPage />
      </MemoryRouter>
    );

    expect(await screen.findByTestId('contextual-error-page')).toBeInTheDocument();
    expect(screen.queryByText('Carregando segurança...')).not.toBeInTheDocument();
    expect(mocks.api.account).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Este dispositivo')).toBeInTheDocument();
    expect(mocks.api.account).toHaveBeenCalledTimes(2);
  });

  it('exige reautenticação antes de mostrar o formulário da primeira senha', async () => {
    mocks.api.account.mockResolvedValue({
      id: 7,
      hasLocalPassword: false,
      canInitializePassword: false
    });
    render(
      <MemoryRouter>
        <SecuritySettingsPage />
      </MemoryRouter>
    );
    expect(
      await screen.findByRole('button', { name: 'Confirmar identidade com GitHub' })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Nova senha')).not.toBeInTheDocument();
  });

  it('cria a primeira senha somente depois de reautenticação recente', async () => {
    const user = userEvent.setup();
    mocks.api.account.mockResolvedValue({
      id: 7,
      hasLocalPassword: false,
      canInitializePassword: true
    });
    render(
      <MemoryRouter>
        <SecuritySettingsPage />
      </MemoryRouter>
    );
    await screen.findByRole('heading', { name: 'Senha' });
    const password = await screen.findByLabelText('Nova senha');
    await user.type(password, 'SenhaNovaSegura123!');
    await user.type(screen.getByLabelText('Confirmar nova senha'), 'SenhaNovaSegura123!');
    await user.click(screen.getByRole('button', { name: 'Criar senha' }));
    await waitFor(() =>
      expect(mocks.api.initializePassword).toHaveBeenCalledWith({
        newPassword: 'SenhaNovaSegura123!',
        confirmation: 'SenhaNovaSegura123!'
      })
    );
  });

  it('envia uma única alteração de senha enquanto a mutação está pendente', async () => {
    let resolveChange;
    mocks.api.changePassword.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveChange = resolve;
        })
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SecuritySettingsPage />
      </MemoryRouter>
    );
    await user.type(await screen.findByLabelText('Senha atual'), 'Senha antiga segura 123');
    await user.type(screen.getByLabelText('Nova senha'), 'Senha nova segura 456');
    await user.type(screen.getByLabelText('Confirmar nova senha'), 'Senha nova segura 456');
    const button = screen.getByRole('button', { name: 'Alterar senha' });

    await user.click(button);
    await user.click(button);
    expect(mocks.api.changePassword).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Alterando senha...' })).toBeDisabled();
    resolveChange({});
    await waitFor(() => expect(screen.getByText(/Senha alterada com sucesso/)).toBeInTheDocument());
  });

  it('explica confirmação divergente da primeira senha e limpa erro obsoleto ao editar', async () => {
    const user = userEvent.setup();
    mocks.api.account.mockResolvedValue({
      id: 7,
      hasLocalPassword: false,
      canInitializePassword: true
    });
    render(
      <MemoryRouter>
        <SecuritySettingsPage />
      </MemoryRouter>
    );
    await user.type(await screen.findByLabelText('Nova senha'), 'SenhaNovaSegura123!');
    const confirmation = screen.getByLabelText('Confirmar nova senha');
    await user.type(confirmation, 'Divergente123!');
    await user.click(screen.getByRole('button', { name: 'Criar senha' }));
    expect(screen.getByRole('alert')).toHaveTextContent('As senhas não coincidem.');
    expect(mocks.api.initializePassword).not.toHaveBeenCalled();
    await user.clear(confirmation);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('apresenta exportação, exclusão e estado vazio de integrações', async () => {
    const { unmount } = render(
      <MemoryRouter>
        <PrivacySettingsPage />
      </MemoryRouter>
    );
    expect(await screen.findByRole('button', { name: 'Exportar meus dados' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Solicitar exclusão' }).parentElement).toHaveClass(
      'settings-actions'
    );
    unmount();
    render(
      <MemoryRouter>
        <IntegrationsSettingsPage />
      </MemoryRouter>
    );
    expect(await screen.findByText('GitHub App não instalada')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Instalar ou autorizar GitHub App' })
    ).toBeInTheDocument();
  });

  it('exibe falha OAuth segura em Integrações sem impedir a carga da página', async () => {
    render(
      <MemoryRouter initialEntries={['/settings/integrations?github=error&reason=invalid_state']}>
        <IntegrationsSettingsPage />
      </MemoryRouter>
    );

    expect(
      await screen.findByText('A confirmação com GitHub não é mais válida. Inicie novamente.')
    ).toBeInTheDocument();
    expect(screen.getByText('GitHub App não instalada')).toBeInTheDocument();
  });

  it('exibe falha OAuth segura em Segurança sem prender o carregamento', async () => {
    render(
      <MemoryRouter initialEntries={['/settings/security?github=error&reason=expired_state']}>
        <SecuritySettingsPage />
      </MemoryRouter>
    );

    expect(
      await screen.findByText('A confirmação com GitHub expirou. Inicie novamente.')
    ).toBeInTheDocument();
    expect(screen.getByText('Este dispositivo')).toBeInTheDocument();
  });

  it('usa fallback OAuth seguro sem expor reason desconhecido', async () => {
    render(
      <MemoryRouter
        initialEntries={['/settings/integrations?github=error&reason=internal_raw_failure']}
      >
        <IntegrationsSettingsPage />
      </MemoryRouter>
    );

    expect(
      await screen.findByText('Não foi possível concluir a operação com o GitHub. Tente novamente.')
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('internal_raw_failure');
  });

  it.each([
    [
      'vínculo de identidade',
      '/settings/integrations?githubIdentity=success',
      IntegrationsSettingsPage,
      'GitHub OAuth vinculado.'
    ],
    [
      'reautenticação sensível',
      '/settings/security?githubReauth=success',
      SecuritySettingsPage,
      'Identidade confirmada. Agora crie sua senha.'
    ]
  ])('preserva o feedback de sucesso de %s', async (_name, route, Page, expected) => {
    render(
      <MemoryRouter initialEntries={[route]}>
        <Page />
      </MemoryRouter>
    );

    expect(await screen.findByText(expected)).toBeInTheDocument();
  });

  it('exige reautenticação recente para excluir uma conta GitHub-only', async () => {
    mocks.api.account.mockResolvedValue({
      id: 7,
      accountStatus: 'ACTIVE',
      hasLocalPassword: false,
      hasGithubIdentity: true,
      recentlyReauthenticated: false
    });
    render(
      <MemoryRouter>
        <PrivacySettingsPage />
      </MemoryRouter>
    );

    expect(
      await screen.findByRole('button', { name: 'Confirmar identidade com GitHub' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Solicitar exclusão' })).toBeDisabled();
  });

  it('envia uma única solicitação de exclusão enquanto a mutação está pendente', async () => {
    let resolveDeletion;
    mocks.api.requestDeletion.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDeletion = resolve;
        })
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PrivacySettingsPage />
      </MemoryRouter>
    );
    await user.type(await screen.findByLabelText('Senha atual'), 'Senha local segura 123');
    const button = screen.getByRole('button', { name: 'Solicitar exclusão' });

    await user.click(button);
    await user.click(button);
    expect(mocks.confirm).toHaveBeenCalledOnce();
    expect(mocks.api.requestDeletion).toHaveBeenCalledOnce();
    expect(button).toBeDisabled();
    resolveDeletion({});
    await waitFor(() => expect(screen.getByText('Exclusão agendada.')).toBeInTheDocument());
  });

  it.each([
    ['privacidade', PrivacySettingsPage, 'deletion'],
    ['integrações', IntegrationsSettingsPage, 'github']
  ])('usa a página contextual quando a carga inicial de %s falha', async (_name, Page, method) => {
    mocks.api[method].mockRejectedValueOnce({ message: 'Falha interna', status: 500 });
    render(
      <MemoryRouter>
        <Page />
      </MemoryRouter>
    );

    expect(await screen.findByTestId('contextual-error-page')).toBeInTheDocument();
  });

  it('mantém a senha fora do estado normal e desconecta a App em um único dialog', async () => {
    const user = userEvent.setup();
    mocks.api.github.mockResolvedValue([
      {
        id: 12,
        installation: {
          accountLogin: 'traceflow-org',
          accountType: 'Organization',
          status: 'ACTIVE',
          manageUrl: 'https://github.com/settings/installations/12'
        },
        repositories: [{ id: 1 }, { id: 2 }],
        projects: [{ id: 20 }]
      }
    ]);
    render(
      <MemoryRouter>
        <IntegrationsSettingsPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('traceflow-org')).toBeInTheDocument();
    expect(screen.queryByLabelText('Senha atual')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gerenciar acesso no GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/settings/installations/12'
    );
    await user.click(screen.getByRole('button', { name: 'Desconectar' }));
    const dialog = screen.getByRole('dialog', { name: 'Desconectar GitHub App?' });
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    expect(dialog).toHaveTextContent('O login com GitHub não será afetado.');
    await user.type(within(dialog).getByLabelText('Senha atual'), 'senha local segura');
    const confirmDisconnect = within(dialog).getByRole('button', { name: 'Desconectar' });
    expect(confirmDisconnect).toBeEnabled();
    await user.click(confirmDisconnect);
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.api.removeGithubAuthorization).toHaveBeenCalledWith(12, 'senha local segura')
    );
    expect(
      screen.getByRole('button', { name: 'Adicionar ou atualizar acesso' })
    ).toBeInTheDocument();
  });

  it('apresenta os repositórios concedidos pela Installation sem renovação OAuth pessoal', async () => {
    mocks.api.github.mockResolvedValue([
      {
        id: 12,
        installation: {
          accountLogin: 'traceflow-org',
          accountType: 'Organization',
          status: 'ACTIVE',
          manageUrl: 'https://github.com/settings/installations/12'
        },
        repositories: [],
        projects: [{ id: 20 }, { id: 21 }]
      }
    ]);
    render(
      <MemoryRouter>
        <IntegrationsSettingsPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('0 repositórios autorizados')).toBeInTheDocument();
    expect(screen.getByText('2 projetos vinculados')).toBeInTheDocument();
    expect(screen.queryByText(/autorização pessoal pendente/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Renovar acesso GitHub/i })
    ).not.toBeInTheDocument();
  });

  it('mantém OAuth e App independentes e explica o pré-requisito no dialog', async () => {
    const user = userEvent.setup();
    mocks.api.account.mockResolvedValue({ hasLocalPassword: false });
    mocks.api.githubIdentity.mockResolvedValue({ linked: true, githubLogin: 'octocat' });
    render(
      <MemoryRouter>
        <IntegrationsSettingsPage />
      </MemoryRouter>
    );
    expect(await screen.findByText('@octocat')).toBeInTheDocument();
    expect(screen.getByText('@octocat').parentElement).toHaveClass('integration-box-compact');
    await user.click(screen.getByRole('button', { name: 'Desvincular' }));
    const dialog = screen.getByRole('dialog', { name: 'Crie uma senha antes de desvincular' });
    expect(within(dialog).queryByLabelText('Senha atual')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Ir para Segurança' })).toHaveAttribute(
      'href',
      '/settings/security'
    );
    expect(dialog).toHaveTextContent('GitHub App continuará funcionando normalmente.');
    expect(screen.getByRole('heading', { name: 'GitHub App' })).toBeInTheDocument();
  });

  it('confirma alteração de e-mail por rota pública', async () => {
    render(
      <MemoryRouter initialEntries={['/settings/account/email-change/confirm?token=token-valido']}>
        <ConfirmationPage type="email" />
      </MemoryRouter>
    );
    expect(await screen.findByText('E-mail alterado. Faça login novamente.')).toBeInTheDocument();
    expect(mocks.api.confirmEmail).toHaveBeenCalledWith('token-valido');
  });

  it.each([
    ['email', '/settings/account/email-change/confirm', 'confirmEmail'],
    ['reactivation', '/account/reactivation/confirm', 'confirmReactivation']
  ])('rejeita confirmação %s sem token sem chamar a API', async (type, route, method) => {
    render(
      <MemoryRouter initialEntries={[route]}>
        <ConfirmationPage type={type} />
      </MemoryRouter>
    );

    expect(await screen.findByText('Link inválido ou incompleto.')).toBeInTheDocument();
    expect(mocks.api[method]).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Ir para o login' })).toHaveAttribute('href', '/login');
  });

  it.each([
    ['email', '/settings/account/email-change/confirm?token=email-strict', 'confirmEmail'],
    [
      'reactivation',
      '/account/reactivation/confirm?token=reactivation-strict',
      'confirmReactivation'
    ]
  ])('executa confirmação %s uma vez sob StrictMode', async (type, route, method) => {
    render(
      <StrictMode>
        <MemoryRouter initialEntries={[route]}>
          <ConfirmationPage type={type} />
        </MemoryRouter>
      </StrictMode>
    );

    expect(
      await screen.findByText(
        type === 'email'
          ? 'E-mail alterado. Faça login novamente.'
          : 'Conta reativada. Faça login novamente.'
      )
    ).toBeInTheDocument();
    expect(mocks.api[method]).toHaveBeenCalledTimes(1);
  });
});
