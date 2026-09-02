import { Navigate, useLocation } from 'react-router';
import { useAuth } from './AuthContext.jsx';
import { SessionBootstrapStatus } from './components/SessionBootstrapStatus.jsx';
import { sanitizeInternalReturnTo } from './return-to.js';

export function GuestOnlyRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <SessionBootstrapStatus />;
  const returnTo = sanitizeInternalReturnTo(location.state?.from || '/projects');
  return user ? <Navigate to={returnTo} replace /> : children;
}
