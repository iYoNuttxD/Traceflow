import { Navigate, useLocation } from 'react-router';
import { useAuth } from './AuthContext.jsx';
import { LoadingState } from '../../shared/index.js';
export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <main className="page">
        <LoadingState message="Carregando sessão..." />
      </main>
    );
  return user ? children : <Navigate to="/login" replace state={{ from: location.pathname }} />;
}
