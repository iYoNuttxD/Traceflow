import { Navigate, useLocation } from 'react-router';
import { useAuth } from './AuthContext.jsx';
import { ContextualErrorPage, FeedbackRegion, LoadingState } from '../../shared/index.js';
import { locationReturnTo } from './return-to.js';
export function ProtectedRoute({ children }) {
  const { user, loading, bootstrapError, refresh } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <main className="page">
        <LoadingState message="Carregando sessão..." />
      </main>
    );
  if (!user && bootstrapError) {
    if (bootstrapError.isRateLimit) {
      return (
        <main className="page-container">
          <section className="session-bootstrap-state">
            <FeedbackRegion
              rateLimit={bootstrapError.message}
              retryAfterSeconds={bootstrapError.retryAfterSeconds}
            />
            <button className="button button-primary" type="button" onClick={() => void refresh()}>
              Tentar novamente
            </button>
          </section>
        </main>
      );
    }
    return (
      <ContextualErrorPage
        type={bootstrapError.type}
        description={bootstrapError.message}
        requestId={bootstrapError.requestId}
        onRetry={refresh}
      />
    );
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
