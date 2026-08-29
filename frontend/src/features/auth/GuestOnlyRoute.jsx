import { Navigate, useLocation } from 'react-router';
import { LoadingState } from '../../shared/index.js';
import { useAuth } from './AuthContext.jsx';
import { sanitizeInternalReturnTo } from './return-to.js';
import './styles/auth-layout.css';

export function GuestOnlyRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <main className="auth-page">
        <LoadingState message="Carregando sessão..." />
      </main>
    );
  const returnTo = sanitizeInternalReturnTo(location.state?.from || '/projects');
  return user ? <Navigate to={returnTo} replace /> : children;
}
