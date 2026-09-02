import { Navigate, useLocation } from 'react-router';
import { useAuth } from './AuthContext.jsx';
import { SessionBootstrapStatus } from './components/SessionBootstrapStatus.jsx';
import { locationReturnTo } from './return-to.js';
export function ProtectedRoute({ children }) {
  const { user, loading, bootstrapError, refresh } = useAuth();
  const location = useLocation();
  if (loading) return <SessionBootstrapStatus />;
  if (!user && bootstrapError) {
    return <SessionBootstrapStatus error={bootstrapError} onRetry={refresh} />;
  }
  if (!user) return <Navigate to="/login" replace state={{ from: locationReturnTo(location) }} />;
  const status = user.accountStatus || (user.isActive === false ? 'DEACTIVATED' : 'ACTIVE');
  if (status === 'ACTIVE' && location.pathname === '/restricted') {
    return <Navigate to="/projects" replace />;
  }
  const restrictedPaths =
    status === 'DELETION_PENDING'
      ? ['/restricted', '/settings/account', '/settings/privacy']
      : ['/restricted', '/settings/account'];
  if (status !== 'ACTIVE' && !restrictedPaths.some((path) => location.pathname.startsWith(path))) {
    return <Navigate to="/restricted" replace />;
  }
  return children;
}
