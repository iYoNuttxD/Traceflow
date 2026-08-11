import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/features/auth/AuthContext.jsx', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn()
  })
}));

const { AppRoutes } = await import('../../src/app/routes/AppRoutes.jsx');

describe('AppRoutes com chunks por rota', () => {
  it('navega entre páginas públicas carregadas sob demanda', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Criar conta' }));
    expect(await screen.findByRole('heading', { name: 'Criar conta' })).toBeInTheDocument();
  });

  it('mantém rota protegida atrás de ProtectedRoute', async () => {
    render(
      <MemoryRouter initialEntries={['/projects']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('reutiliza a página contextual em rota inexistente sem assumir projeto', async () => {
    render(
      <MemoryRouter initialEntries={['/rota-inexistente']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(
      await screen.findByRole('heading', { name: 'Página não encontrada.' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir para o início' })).toHaveAttribute('href', '/');
    expect(screen.queryByText('Voltar aos projetos')).not.toBeInTheDocument();
  });
});
