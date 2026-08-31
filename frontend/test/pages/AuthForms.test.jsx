import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ login: vi.fn(), register: vi.fn() }));
const authApi = vi.hoisted(() => ({
  startGithubLogin: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn()
}));
vi.mock('../../src/features/auth/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../../src/features/auth/api/auth.api.js', () => ({ authApi }));
import { LoginPage } from '../../src/pages/LoginPage.jsx';
import { RegisterPage } from '../../src/pages/RegisterPage.jsx';
import { ForgotPasswordPage } from '../../src/pages/ForgotPasswordPage.jsx';
import { ResetPasswordPage } from '../../src/pages/ResetPasswordPage.jsx';

function LocationProbe() {
  const location = useLocation();
  return <output>{`${location.pathname}${location.search}${location.hash}`}</output>;
}

describe('formulários de identidade acessíveis', () => {
  beforeEach(() => vi.clearAllMocks());

  it('foca o primeiro campo obrigatório e não envia formulário inválido', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(screen.getByLabelText(/Nome de usuário ou e-mail/)).toHaveFocus();
    expect(screen.getByLabelText(/Nome de usuário ou e-mail/)).toHaveAccessibleDescription(
      'Campo obrigatório.'
    );
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('mapeia fieldErrors seguros do backend e reabilita o submit', async () => {
    auth.register.mockRejectedValue({
      response: {
        status: 400,
        data: {
          message: 'Dados inválidos.',
          details: [{ field: 'body.email', message: 'E-mail inválido.' }]
        }
      }
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    );
    expect(screen.queryByLabelText(/CPF/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/telefone/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/token GitHub/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Força da senha/)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Nome completo/), 'Pessoa');
    await user.type(screen.getByLabelText(/Nome de usuário/), 'pessoa.teste');
    await user.type(screen.getByLabelText(/E-mail/), 'invalid');
    await user.type(screen.getByLabelText(/^Senha/), 'Frase longa segura 123');
    await user.type(screen.getByLabelText(/Confirmar senha/), 'Frase longa segura 123');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));
    await waitFor(() => expect(screen.getByLabelText(/E-mail/)).toHaveFocus());
    expect(screen.getByLabelText(/E-mail/)).toHaveAccessibleDescription('E-mail inválido.');
    expect(screen.getByRole('button', { name: 'Criar conta' })).toBeEnabled();
  });

  it('oferece sessão persistente, visualização de senha e login GitHub funcional', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );
    expect(screen.getByLabelText('Manter sessão ativa')).toBeInTheDocument();
    const password = screen.getByLabelText('Senha *');
    expect(password).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Continuar com GitHub' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Continuar com GitHub' })).toHaveClass(
      'github-login-button'
    );
  });

  it('inicia o OAuth preservando rememberMe e o retorno interno', async () => {
    authApi.startGithubLogin.mockRejectedValueOnce({
      response: { status: 503, data: { message: 'GitHub indisponível.' } }
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[
          { pathname: '/login', state: { from: '/projects/abc/tasks?status=open#task-42' } }
        ]}
      >
        <LoginPage />
      </MemoryRouter>
    );

    await user.click(screen.getByLabelText('Manter sessão ativa'));
    await user.click(screen.getByRole('button', { name: 'Continuar com GitHub' }));

    expect(authApi.startGithubLogin).toHaveBeenCalledWith({
      rememberMe: true,
      returnTo: '/projects/abc/tasks?status=open#task-42'
    });
    expect(
      await screen.findByText(
        'O serviço está temporariamente indisponível. Tente novamente em instantes.'
      )
    ).toBeInTheDocument();
  });

  it('preserva identifier, senha e rememberMe no contrato de login local', async () => {
    auth.login.mockResolvedValue({ id: 'user-1' });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/Nome de usuário ou e-mail/), 'pessoa.teste');
    await user.type(screen.getByLabelText('Senha *'), 'Frase longa segura 123');
    await user.click(screen.getByLabelText('Manter sessão ativa'));
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(auth.login).toHaveBeenCalledWith({
      identifier: 'pessoa.teste',
      password: 'Frase longa segura 123',
      rememberMe: true
    });
  });

  it('mantém a copy pública funcional e não reintroduz conteúdo institucional', () => {
    const { unmount } = render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Acesse com seu nome de usuário ou e-mail.')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/Acesso seguro|Identidade TRACEFLOW/i);
    expect(document.body).not.toHaveTextContent(/ambiente seguro|aviso de privacidade/i);

    unmount();
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Preencha os campos para criar sua conta.')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/Acesso seguro|Identidade TRACEFLOW/i);
    expect(document.body).not.toHaveTextContent(/ambiente seguro|aviso de privacidade/i);
    expect(document.body).not.toHaveTextContent(/GitHub App|repositório|instalação/i);
  });

  it('preserva a resposta genérica de recuperação e usa retorno determinístico', async () => {
    authApi.forgotPassword.mockResolvedValue({
      data: { message: 'Se a conta existir, enviaremos instruções para o e-mail informado.' }
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Voltar para entrar' })).toHaveAttribute(
      'href',
      '/login'
    );
    await user.type(screen.getByLabelText('E-mail *'), 'pessoa@example.com');
    await user.click(screen.getByRole('button', { name: 'Enviar instruções' }));

    expect(authApi.forgotPassword).toHaveBeenCalledWith('pessoa@example.com');
    expect(
      await screen.findByText('Se a conta existir, enviaremos instruções para o e-mail informado.')
    ).toBeInTheDocument();
  });

  it('apresenta token ausente de reset como status Focused sem chamar a API', () => {
    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <ResetPasswordPage />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('heading', { name: 'Link de redefinição inválido' })
    ).toBeInTheDocument();
    expect(screen.getByText('Link de redefinição inválido ou incompleto.')).toBeInTheDocument();
    expect(authApi.resetPassword).not.toHaveBeenCalled();
  });

  it.each([
    [
      '/login?github=error&reason=invalid_state',
      'A confirmação com GitHub não é mais válida. Inicie novamente.'
    ],
    [
      '/login?github=error&reason=internal_raw_failure',
      'Não foi possível concluir a operação com o GitHub. Tente novamente.'
    ]
  ])('usa o mapping OAuth compartilhado em %s', (route, expected) => {
    render(
      <MemoryRouter initialEntries={[route]}>
        <LoginPage />
      </MemoryRouter>
    );

    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('internal_raw_failure');
  });

  it('preserva pathname, query e hash no retorno após login local', async () => {
    auth.login.mockResolvedValue({ id: 'user-1' });
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[
          { pathname: '/login', state: { from: '/projects/abc/tasks?status=open#task-42' } }
        ]}
      >
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/Nome de usuário ou e-mail/), 'pessoa.teste');
    await user.type(screen.getByLabelText('Senha *'), 'Frase longa segura 123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() =>
      expect(screen.getByText('/projects/abc/tasks?status=open#task-42')).toBeInTheDocument()
    );
  });

  it('preserva pathname, query e hash no retorno após cadastro local', async () => {
    auth.register.mockResolvedValue({ id: 'user-1' });
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[
          { pathname: '/register', state: { from: '/invitations/accept?token=abc#details' } }
        ]}
      >
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/Nome completo/), 'Pessoa Teste');
    await user.type(screen.getByLabelText(/Nome de usuário/), 'pessoa.teste');
    await user.type(screen.getByLabelText(/E-mail/), 'pessoa@example.com');
    await user.type(screen.getByLabelText(/^Senha/), 'Frase longa segura 123');
    await user.type(screen.getByLabelText(/Confirmar senha/), 'Frase longa segura 123');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    await waitFor(() =>
      expect(screen.getByText('/invitations/accept?token=abc#details')).toBeInTheDocument()
    );
  });

  it('impede dois logins concorrentes mesmo antes do disabled ser renderizado', async () => {
    let resolveLogin;
    auth.login.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLogin = resolve;
        })
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );
    await user.type(screen.getByLabelText(/Nome de usuário ou e-mail/), 'pessoa.teste');
    await user.type(screen.getByLabelText('Senha *'), 'Frase longa segura 123');
    const form = screen.getByRole('button', { name: 'Entrar' }).closest('form');

    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(auth.login).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Entrando...' })).toHaveAttribute(
      'aria-busy',
      'true'
    );
    await act(async () => resolveLogin({ id: 'user-1' }));
  });

  it('impede duas redefinições de senha concorrentes', async () => {
    let resolveReset;
    authApi.resetPassword.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveReset = resolve;
        })
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/reset-password?token=token-artificial']}>
        <ResetPasswordPage />
      </MemoryRouter>
    );
    await user.type(screen.getByLabelText('Nova senha *'), 'Frase longa segura 123');
    await user.type(screen.getByLabelText('Confirmar nova senha *'), 'Frase longa segura 123');
    const form = screen.getByRole('button', { name: 'Redefinir senha' }).closest('form');

    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(authApi.resetPassword).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Redefinindo...' })).toBeDisabled();
    await act(async () => resolveReset({ data: {} }));
  });

  it('foca a confirmação divergente durante a redefinição', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/reset-password?token=token-artificial']}>
        <ResetPasswordPage />
      </MemoryRouter>
    );
    await user.type(screen.getByLabelText('Nova senha *'), 'Frase longa segura 123');
    await user.type(screen.getByLabelText('Confirmar nova senha *'), 'Outra frase segura 456');
    await user.click(screen.getByRole('button', { name: 'Redefinir senha' }));

    expect(screen.getByLabelText('Confirmar nova senha *')).toHaveFocus();
    expect(screen.getByLabelText('Confirmar nova senha *')).toHaveAccessibleDescription(
      'As senhas não coincidem.'
    );
    expect(authApi.resetPassword).not.toHaveBeenCalled();
  });
});
