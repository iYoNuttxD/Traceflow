import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <main className="page"><p>Carregando sessão...</p></main>;
  return user ? children : <Navigate to="/login" replace state={{ from: location.pathname }} />;
}
