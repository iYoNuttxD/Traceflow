import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ login: vi.fn(), register: vi.fn() }));
vi.mock('../../src/features/auth/index.js', () => ({ useAuth: () => auth }));
import { LoginPage } from '../../src/pages/LoginPage.jsx';
import { RegisterPage } from '../../src/pages/RegisterPage.jsx';

describe('formulários de identidade acessíveis', () => {
  beforeEach(() => vi.clearAllMocks());

  it('foca o primeiro campo obrigatório e não envia formulário inválido', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(screen.getByLabelText(/E-mail/)).toHaveFocus();
    expect(screen.getByLabelText(/E-mail/)).toHaveAccessibleDescription('Campo obrigatório.');
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('mapeia fieldErrors seguros do backend e reabilita o submit', async () => {
    auth.register.mockRejectedValue({ response: { status: 400, data: { message: 'Dados inválidos.', details: [{ field: 'body.email', message: 'E-mail inválido.' }] } } });
    const user = userEvent.setup();
    render(<MemoryRouter><RegisterPage /></MemoryRouter>);
    await user.type(screen.getByLabelText(/Nome/), 'Pessoa');
    await user.type(screen.getByLabelText(/E-mail/), 'invalid');
    await user.type(screen.getByLabelText(/Senha/), 'senha');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));
    await waitFor(() => expect(screen.getByLabelText(/E-mail/)).toHaveFocus());
    expect(screen.getByLabelText(/E-mail/)).toHaveAccessibleDescription('E-mail inválido.');
    expect(screen.getByRole('button', { name: 'Criar conta' })).toBeEnabled();
  });
});
