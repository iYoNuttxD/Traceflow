import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
let authState;
vi.mock('../../src/features/auth/AuthContext.jsx', () => ({ useAuth: () => authState }));
const { ProtectedRoute } = await import('../../src/features/auth/ProtectedRoute.jsx');
function renderRoute() { return render(<MemoryRouter initialEntries={['/projects']}><Routes><Route path="/login" element={<h1>Entrar</h1>} /><Route path="/projects" element={<ProtectedRoute><h1>Projetos privados</h1></ProtectedRoute>} /></Routes></MemoryRouter>); }
describe('ProtectedRoute', () => {
  beforeEach(() => { authState = { user: null, loading: false }; });
  it('redireciona visitante para login', () => { renderRoute(); expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument(); });
  it('preserva loading sem renderizar conteúdo privado', () => { authState.loading = true; renderRoute(); expect(screen.getByText('Carregando sessão...')).toBeInTheDocument(); });
  it('renderiza rota para usuário autenticado', () => { authState.user = { id: 1, name: 'Pessoa' }; renderRoute(); expect(screen.getByText('Projetos privados')).toBeInTheDocument(); });
});
