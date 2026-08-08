import { MemoryRouter } from 'react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ login: vi.fn(), register: vi.fn() }));
vi.mock('../../src/features/auth/AuthContext.jsx', () => ({ useAuth: () => auth }));
import { LoginPage } from '../../src/pages/LoginPage.jsx';
import { RegisterPage } from '../../src/pages/RegisterPage.jsx';

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
    expect(screen.getByRole('button', { name: 'Entrar com GitHub' })).toBeEnabled();
  });
});
