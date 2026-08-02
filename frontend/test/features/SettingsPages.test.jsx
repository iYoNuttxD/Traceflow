import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { user: null, logout: vi.fn(), refresh: vi.fn() },
  confirm: vi.fn(),
  api: {
    account: vi.fn(),
    updateProfile: vi.fn(),
    sessions: vi.fn(),
    deletion: vi.fn(),
    github: vi.fn(),
    removeGithubAuthorization: vi.fn(),
    startGithubInstallation: vi.fn(),
    confirmEmail: vi.fn(),
    startReactivation: vi.fn()
  }
}));

vi.mock('../../src/features/auth/index.js', () => ({ useAuth: () => mocks.auth }));
vi.mock('../../src/features/settings/settings.api.js', () => ({ settingsApi: mocks.api }));
vi.mock('../../src/shared/index.js', () => ({
  normalizeApiError: (value) => ({ message: value?.message || 'Falha' }),
  useConfirm: () => mocks.confirm
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
      nextUsernameChangeAt: null
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
    mocks.api.github.mockResolvedValue([]);
    mocks.api.removeGithubAuthorization.mockResolvedValue({});
    mocks.api.startGithubInstallation.mockResolvedValue({
      data: { url: 'https://github.example/install' }
    });
    mocks.api.confirmEmail.mockResolvedValue({});
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
      await screen.findByText('Nenhuma autorização GitHub vinculada à sua conta.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Instalar ou autorizar GitHub App' })
    ).toBeInTheDocument();
  });

  it('separa dados e remoção da autorização GitHub em uma zona de risco', async () => {
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
    expect(screen.getByRole('button', { name: 'Remover minha autorização' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Gerenciar acesso no GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/settings/installations/12'
    );
    expect(
      screen.getByRole('button', { name: 'Adicionar ou atualizar acesso' })
    ).toBeInTheDocument();
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
});
