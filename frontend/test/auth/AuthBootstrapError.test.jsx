import { MemoryRouter } from 'react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authApi: {
    me: vi.fn(),
    csrf: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn()
  },
  setCsrfToken: vi.fn(),
  resetHttpSessionScope: vi.fn()
}));

vi.mock('../../src/features/auth/api/auth.api.js', () => ({ authApi: mocks.authApi }));
vi.mock('../../src/api/http-client.js', () => ({
  setCsrfToken: mocks.setCsrfToken,
  resetHttpSessionScope: mocks.resetHttpSessionScope
}));

const { AuthProvider } = await import('../../src/features/auth/AuthContext.jsx');
const { GuestOnlyRoute } = await import('../../src/features/auth/GuestOnlyRoute.jsx');
const { LoginPage } = await import('../../src/pages/LoginPage.jsx');

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <GuestOnlyRoute>
          <LoginPage />
        </GuestOnlyRoute>
      </AuthProvider>
    </MemoryRouter>
  );
}

function networkError() {
  return { isAxiosError: true, code: 'ERR_NETWORK', request: {} };
}

describe('bootstrap de autenticação indisponível', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authApi.login.mockResolvedValue({ data: {} });
    mocks.authApi.register.mockResolvedValue({ data: {} });
    mocks.authApi.logout.mockResolvedValue({ data: {} });
  });

  it('mantém o login montado quando /auth/me e /auth/csrf falham por rede', async () => {
    mocks.authApi.me.mockRejectedValueOnce(networkError());
    mocks.authApi.csrf.mockRejectedValueOnce(networkError());
    renderLogin();

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Não foi possível conectar ao servidor do TRACEFLOW.'
    );
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    expect(screen.queryByText('Voltar aos projetos')).not.toBeInTheDocument();
    expect(mocks.resetHttpSessionScope).not.toHaveBeenCalled();
  });

  it('mantém o login normal em 401 AUTHENTICATION_REQUIRED', async () => {
    mocks.authApi.me.mockRejectedValueOnce({
      response: { status: 401, data: { code: 'AUTHENTICATION_REQUIRED' } }
    });
    mocks.authApi.csrf.mockResolvedValueOnce({ data: { csrfToken: 'csrf-guest' } });
    renderLogin();

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(screen.queryByText(/Não foi possível conectar/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument();
  });

  it('recupera o fluxo quando o backend volta e o usuário aciona retry', async () => {
    const user = userEvent.setup();
    mocks.authApi.me.mockRejectedValueOnce(networkError()).mockResolvedValueOnce({
      data: { user: null }
    });
    mocks.authApi.csrf.mockRejectedValueOnce(networkError()).mockResolvedValueOnce({
      data: { csrfToken: 'csrf-recuperado' }
    });
    renderLogin();

    await user.click(await screen.findByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() =>
      expect(screen.queryByText(/Não foi possível conectar/)).not.toBeInTheDocument()
    );
    expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(mocks.authApi.me).toHaveBeenCalledTimes(2);
    expect(mocks.authApi.csrf).toHaveBeenCalledTimes(2);
    expect(mocks.setCsrfToken).toHaveBeenCalledWith('csrf-recuperado');
  });
});
