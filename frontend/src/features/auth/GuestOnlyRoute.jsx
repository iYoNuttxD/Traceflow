import { Navigate } from 'react-router';
import { LoadingState } from '../../shared/index.js';
import { useAuth } from './AuthContext.jsx';

export function GuestOnlyRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <main className="auth-page">
        <LoadingState message="Carregando sessão..." />
      </main>
    );
  return user ? <Navigate to="/projects" replace /> : children;
}
