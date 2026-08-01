import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let authState;
vi.mock('../../src/features/auth/AuthContext.jsx', () => ({ useAuth: () => authState }));
const { GuestOnlyRoute } = await import('../../src/features/auth/GuestOnlyRoute.jsx');

function renderRoute() {
  return render(
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
});
