import { StrictMode } from 'react';
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

const { AuthProvider, useAuth } = await import('../../src/features/auth/AuthContext.jsx');

function AuthHarness() {
  const auth = useAuth();
  return (
    <div>
      <p data-testid="auth-state">{auth.loading ? 'Carregando' : auth.user?.name || 'Visitante'}</p>
      {auth.bootstrapError && <p data-testid="bootstrap-error">{auth.bootstrapError.message}</p>}
      <button type="button" onClick={() => auth.login({ email: 'login@example.test' })}>
        Login
      </button>
      <button type="button" onClick={() => auth.register({ name: 'Nova pessoa' })}>
        Registrar
      </button>
      <button type="button" onClick={auth.logout}>
        Sair
      </button>
      <button type="button" onClick={() => Promise.all([auth.refresh(), auth.refresh()])}>
        Atualizar duas vezes
      </button>
    </div>
  );
}

function renderProvider({ strict = false } = {}) {
  const tree = (
    <AuthProvider>
      <AuthHarness />
    </AuthProvider>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authApi.me.mockResolvedValue({ data: { user: { id: 1, name: 'Daniel' } } });
    mocks.authApi.csrf.mockResolvedValue({ data: { csrfToken: 'csrf-restaurado' } });
    mocks.authApi.login.mockResolvedValue({
      data: { user: { id: 2, name: 'Login' }, csrfToken: 'csrf-login' }
    });
    mocks.authApi.register.mockResolvedValue({
      data: { user: { id: 3, name: 'Cadastro' }, csrfToken: 'csrf-cadastro' }
    });
    mocks.authApi.logout.mockResolvedValue({ data: {} });
  });

  it('restaura sessão e CSRF uma única vez mesmo sob StrictMode', async () => {
    renderProvider({ strict: true });

    expect(await screen.findByTestId('auth-state')).toHaveTextContent('Daniel');
    expect(mocks.authApi.me).toHaveBeenCalledTimes(1);
    expect(mocks.authApi.csrf).toHaveBeenCalledTimes(1);
    expect(mocks.setCsrfToken).toHaveBeenCalledWith('csrf-restaurado');
  });

  it('encerra o loading e limpa a sessão quando a API comprova ausência de autenticação', async () => {
    mocks.authApi.me.mockRejectedValueOnce({
      response: { status: 401, data: { code: 'AUTHENTICATION_REQUIRED' } }
    });
    renderProvider();

    expect(await screen.findByTestId('auth-state')).toHaveTextContent('Visitante');
    expect(mocks.setCsrfToken).toHaveBeenCalledWith();
    expect(screen.queryByTestId('bootstrap-error')).not.toBeInTheDocument();
  });

  it('não transforma indisponibilidade de rede em sessão comprovadamente ausente', async () => {
    mocks.authApi.me.mockRejectedValueOnce({
      isAxiosError: true,
      code: 'ERR_NETWORK',
      request: {}
    });
    renderProvider();

    expect(await screen.findByTestId('auth-state')).toHaveTextContent('Visitante');
    expect(screen.getByTestId('bootstrap-error')).toHaveTextContent(
      'Não foi possível conectar ao servidor do TRACEFLOW.'
    );
    expect(mocks.resetHttpSessionScope).not.toHaveBeenCalled();
    expect(mocks.setCsrfToken).not.toHaveBeenCalledWith();
  });

  it('preserva os fluxos de login, registro e logout com rotação do CSRF', async () => {
    const user = userEvent.setup();
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('auth-state')).toHaveTextContent('Daniel'));

    await user.click(screen.getByRole('button', { name: 'Login' }));
    await waitFor(() => expect(screen.getByTestId('auth-state')).toHaveTextContent('Login'));
    expect(mocks.setCsrfToken).toHaveBeenLastCalledWith('csrf-login');
    expect(mocks.resetHttpSessionScope).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(screen.getByTestId('auth-state')).toHaveTextContent('Cadastro'));
    expect(mocks.setCsrfToken).toHaveBeenLastCalledWith('csrf-cadastro');

    await user.click(screen.getByRole('button', { name: 'Sair' }));
    await waitFor(() => expect(screen.getByTestId('auth-state')).toHaveTextContent('Visitante'));
    expect(mocks.authApi.logout).toHaveBeenCalledTimes(1);
    expect(mocks.setCsrfToken).toHaveBeenLastCalledWith();
    expect(mocks.resetHttpSessionScope).toHaveBeenCalled();
  });

  it('coalesce refreshes concorrentes', async () => {
    const user = userEvent.setup();
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('auth-state')).toHaveTextContent('Daniel'));
    vi.clearAllMocks();

    let resolveMe;
    mocks.authApi.me.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveMe = resolve;
        })
    );
    mocks.authApi.csrf.mockResolvedValueOnce({ data: { csrfToken: 'csrf-atualizado' } });
    await user.click(screen.getByRole('button', { name: 'Atualizar duas vezes' }));

    expect(mocks.authApi.me).toHaveBeenCalledTimes(1);
    expect(mocks.authApi.csrf).toHaveBeenCalledTimes(1);
    resolveMe({ data: { user: { id: 4, name: 'Atualizado' } } });
    await waitFor(() => expect(screen.getByTestId('auth-state')).toHaveTextContent('Atualizado'));
  });

  it('limpa a sessão no evento global de 401 sem tratar 403 como logout', async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('auth-state')).toHaveTextContent('Daniel'));

    window.dispatchEvent(new CustomEvent('traceflow:forbidden'));
    expect(screen.getByTestId('auth-state')).toHaveTextContent('Daniel');

    window.dispatchEvent(new CustomEvent('traceflow:unauthorized'));
    await waitFor(() => expect(screen.getByTestId('auth-state')).toHaveTextContent('Visitante'));
    expect(mocks.setCsrfToken).toHaveBeenLastCalledWith();
  });

  it('atualiza a identidade quando o backend sinaliza estado restrito', async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('auth-state')).toHaveTextContent('Daniel'));
    mocks.authApi.me.mockResolvedValueOnce({
      data: { user: { id: 1, name: 'Daniel restrito', accountStatus: 'DEACTIVATED' } }
    });
    window.dispatchEvent(new CustomEvent('traceflow:account-restricted'));
    await waitFor(() =>
      expect(screen.getByTestId('auth-state')).toHaveTextContent('Daniel restrito')
    );
  });
});
