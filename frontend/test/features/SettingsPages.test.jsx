import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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
  FeedbackRegion: ({ error, success }) => <div>{error || success}</div>
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
const { Navbar } = await import('../../src/components/Navbar.jsx');

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

  it('mostra menu acessível com avatar de iniciais', () => {
    mocks.auth.user = {
      id: 7,
      name: 'Daniel Ganz Musse',
      email: 'daniel@example.invalid',
      accountStatus: 'ACTIVE'
    };
    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    );
    expect(screen.getByText('DG')).toBeInTheDocument();
    expect(screen.getByLabelText('Abrir menu de Daniel Ganz Musse')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Configurações' })).toHaveAttribute(
      'href',
      '/settings/account'
    );
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
    await user.click(screen.getByRole('button', { name: 'Salvar nome' }));
    expect(mocks.api.updateProfile).toHaveBeenCalledWith('Daniel Atualizado');
    expect(await screen.findByText('Nome atualizado.')).toBeInTheDocument();
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
    await screen.findByRole('heading', { name: 'Criar senha de acesso' });
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
      'danger-zone-actions'
    );
    unmount();
    render(
      <MemoryRouter>
        <IntegrationsSettingsPage />
      </MemoryRouter>
    );
    expect(
      await screen.findByText('Nenhuma GitHub App conectada à sua conta.')
    ).toBeInTheDocument();
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
    expect(screen.getByText('Nenhuma GitHub App conectada à sua conta.')).toBeInTheDocument();
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
      'Conta GitHub vinculada com sucesso.'
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

  it('separa dados e desconexão da GitHub App em uma zona de risco', async () => {
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
    const password = screen.getByLabelText('Senha atual');
    const dangerZone = password.closest('.github-authorization-danger');
    expect(dangerZone).toHaveClass('danger-zone');
    expect(dangerZone).toHaveTextContent('Esta autorização está relacionada a 1 projeto.');
    expect(screen.getByRole('button', { name: 'Desconectar GitHub App' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Gerenciar acesso no GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/settings/installations/12'
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

    const status = await screen.findByText(/0 repositório\(s\) concedido\(s\) à instalação/);
    expect(status).toHaveTextContent('2 projeto(s) conectado(s)');
    expect(screen.queryByText(/autorização pessoal pendente/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Renovar acesso GitHub/i })
    ).not.toBeInTheDocument();
  });

  it('bloqueia desvínculo visual de conta GitHub-only e preserva a área da GitHub App', async () => {
    mocks.api.account.mockResolvedValue({ hasLocalPassword: false });
    mocks.api.githubIdentity.mockResolvedValue({ linked: true, githubLogin: 'octocat' });
    render(
      <MemoryRouter>
        <IntegrationsSettingsPage />
      </MemoryRouter>
    );
    expect(await screen.findByText('@octocat')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'crie uma senha em Segurança' })).toHaveAttribute(
      'href',
      '/settings/security'
    );
    expect(
      screen.queryByRole('button', { name: 'Desvincular conta GitHub' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'GitHub App' })).toBeInTheDocument();
  });

  it('confirma alteração de e-mail por rota pública', async () => {
    render(
      <MemoryRouter initialEntries={['/settings/account/email-change/confirm?token=token-valido']}>
        <ConfirmationPage type="email" />
      </MemoryRouter>
    );
    expect(await screen.findByText(/Operação concluída/)).toBeInTheDocument();
    expect(mocks.api.confirmEmail).toHaveBeenCalledWith('token-valido');
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

    expect(await screen.findByText(/Operação concluída/)).toBeInTheDocument();
    expect(mocks.api[method]).toHaveBeenCalledTimes(1);
  });
});
