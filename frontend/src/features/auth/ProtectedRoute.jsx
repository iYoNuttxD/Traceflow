import { Navigate, useLocation } from 'react-router';
import { useAuth } from './AuthContext.jsx';
import { LoadingState } from '../../shared/index.js';
import { locationReturnTo } from './return-to.js';
export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <main className="page">
        <LoadingState message="Carregando sessão..." />
      </main>
    );
  if (!user) return <Navigate to="/login" replace state={{ from: locationReturnTo(location) }} />;
  const status = user.accountStatus || (user.isActive === false ? 'DEACTIVATED' : 'ACTIVE');
  const restrictedPaths =
    status === 'DELETION_PENDING'
      ? ['/restricted', '/settings/account', '/settings/privacy']
      : ['/restricted', '/settings/account'];
  if (status !== 'ACTIVE' && !restrictedPaths.some((path) => location.pathname.startsWith(path))) {
    return <Navigate to="/restricted" replace />;
  }
  return children;
}
