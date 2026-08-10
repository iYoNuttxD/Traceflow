import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let authState;
vi.mock('../../src/features/auth/AuthContext.jsx', () => ({ useAuth: () => authState }));
const { ProtectedRoute } = await import('../../src/features/auth/ProtectedRoute.jsx');

function LoginProbe() {
  const location = useLocation();
  return <h1>Entrar {location.state?.from || ''}</h1>;
}

function renderRoute(initialEntry = '/projects') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/login" element={<LoginProbe />} />
        <Route
          path="/restricted"
          element={
            <ProtectedRoute>
              <h1>Conta restrita</h1>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings/privacy"
          element={
            <ProtectedRoute>
              <h1>Privacidade restrita</h1>
            </ProtectedRoute>
          }
        />
        <Route
          path="/projects/*"
          element={
            <ProtectedRoute>
              <h1>Projetos privados</h1>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    authState = { user: null, loading: false };
  });

  it('redireciona visitante para login', () => {
    renderRoute();
    expect(screen.getByRole('heading', { name: 'Entrar /projects' })).toBeInTheDocument();
  });

  it('preserva a rota originalmente solicitada para retorno após login', () => {
    renderRoute('/projects/7/tasks');
    expect(screen.getByRole('heading', { name: 'Entrar /projects/7/tasks' })).toBeInTheDocument();
  });

  it('preserva pathname, search e hash no retorno após login', () => {
    renderRoute('/projects/7/tasks?filter=open#history');
    expect(
      screen.getByRole('heading', { name: 'Entrar /projects/7/tasks?filter=open#history' })
    ).toBeInTheDocument();
  });

  it('preserva loading sem renderizar conteúdo privado', () => {
    authState.loading = true;
    renderRoute();
    expect(screen.getByText('Carregando sessão...')).toBeInTheDocument();
  });

  it('renderiza rota para usuário autenticado', () => {
    authState.user = { id: 1, name: 'Pessoa' };
    renderRoute();
    expect(screen.getByText('Projetos privados')).toBeInTheDocument();
  });

  it('redireciona conta desativada para modo restrito', () => {
    authState.user = { id: 1, accountStatus: 'DEACTIVATED' };
    renderRoute();
    expect(screen.getByRole('heading', { name: 'Conta restrita' })).toBeInTheDocument();
  });

  it('permite privacidade durante exclusão pendente', () => {
    authState.user = { id: 1, accountStatus: 'DELETION_PENDING' };
    renderRoute('/settings/privacy');
    expect(screen.getByRole('heading', { name: 'Privacidade restrita' })).toBeInTheDocument();
  });

  it('redireciona usuário ACTIVE que abrir /restricted', () => {
    authState.user = { id: 1, accountStatus: 'ACTIVE' };
    renderRoute('/restricted');
    expect(screen.getByRole('heading', { name: 'Projetos privados' })).toBeInTheDocument();
  });
});
