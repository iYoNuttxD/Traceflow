import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let authState;
vi.mock('../../src/features/auth/AuthContext.jsx', () => ({ useAuth: () => authState }));
const { GuestOnlyRoute } = await import('../../src/features/auth/GuestOnlyRoute.jsx');

function renderRoute(initialEntry = '/login') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/login"
          element={
            <GuestOnlyRoute>
              <h1>Entrar</h1>
            </GuestOnlyRoute>
          }
        />
        <Route path="/projects" element={<h1>Projetos</h1>} />
        <Route path="/settings/security" element={<h1>Segurança</h1>} />
        <Route path="/invitations/accept" element={<h1>Convite</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('GuestOnlyRoute', () => {
  beforeEach(() => {
    authState = { user: null, loading: false };
  });
  it('renderiza a página para visitante', () => {
    renderRoute();
    expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
  });
  it('aguarda restauração e redireciona autenticado', () => {
    authState = { user: { id: 1 }, loading: true };
    const view = renderRoute();
    expect(screen.getByText('Carregando sessão...')).toBeInTheDocument();
    authState = { user: { id: 1 }, loading: false };
    view.rerender(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route
            path="/login"
            element={
              <GuestOnlyRoute>
                <h1>Entrar</h1>
              </GuestOnlyRoute>
            }
          />
          <Route path="/projects" element={<h1>Projetos</h1>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: 'Projetos' })).toBeInTheDocument();
  });
  it('preserva pathname, query e hash quando o AuthContext muda antes da tela', () => {
    authState = { user: { id: 1 }, loading: false };
    renderRoute({
      pathname: '/login',
      state: { from: '/settings/security?from=deep#sessions' }
    });
    expect(screen.getByRole('heading', { name: 'Segurança' })).toBeInTheDocument();
  });
  it('preserva convite e rejeita destino externo', () => {
    authState = { user: { id: 1 }, loading: false };
    const view = renderRoute({
      pathname: '/login',
      state: { from: '/invitations/accept?token=ABC#confirmar' }
    });
    expect(screen.getByRole('heading', { name: 'Convite' })).toBeInTheDocument();
    view.unmount();
    renderRoute({ pathname: '/login', state: { from: '//evil.example/path' } });
    expect(screen.getByRole('heading', { name: 'Projetos' })).toBeInTheDocument();
  });
});
