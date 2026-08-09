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

  it('mantém o cronograma (RF10) atrás de ProtectedRoute', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/1/schedule']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
  });
});
