import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { resetHttpSessionScope, setCsrfToken } from '../../api/http-client.js';
import {
  PAGE_ERROR_TYPES,
  classifyPageError,
  getErrorRequestId,
  isAuthenticationFailure,
  isNetworkOrServiceUnavailable,
  normalizeApiError
} from '../../shared/index.js';
import { authApi } from './api/auth.api.js';

const AuthContext = createContext(null);
const bootstrapRequestOptions = Object.freeze({
  // O AuthProvider é o único responsável por interpretar os probes de bootstrap.
  skipGlobalAuthHandling: true
});

function createBootstrapError(error) {
  const unavailable = isNetworkOrServiceUnavailable(error);
  const normalized = normalizeApiError(error, 'Não foi possível verificar sua sessão.');
  const isRateLimit = normalized.status === 429;
  return {
    type: unavailable ? PAGE_ERROR_TYPES.NETWORK : classifyPageError(error),
    message: isRateLimit
      ? normalized.message
      : unavailable
        ? 'Não foi possível conectar ao servidor do TRACEFLOW. Tente novamente em instantes.'
        : 'Não foi possível verificar sua sessão. Tente novamente em instantes.',
    requestId: getErrorRequestId(error),
    isRateLimit,
    retryAfterSeconds: normalized.retryAfterSeconds
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState(null);
  const refreshPromiseRef = useRef(null);

  const clearAuthenticatedState = useCallback(() => {
    setCsrfToken();
    setUser(null);
    setBootstrapError(null);
  }, []);

  const invalidateAuthenticatedSession = useCallback(() => {
    resetHttpSessionScope();
    clearAuthenticatedState();
  }, [clearAuthenticatedState]);

  const handleBootstrapFailure = useCallback((error) => {
    setCsrfToken();
    setUser(null);
    setBootstrapError(createBootstrapError(error));
  }, []);

  const refresh = useCallback(() => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const operation = (async () => {
      try {
        let meResponse;
        try {
          meResponse = await authApi.me(bootstrapRequestOptions);
        } catch (error) {
          if (isAuthenticationFailure(error)) clearAuthenticatedState();
          else handleBootstrapFailure(error);
          return;
        }

        try {
          const csrfResponse = await authApi.csrf(bootstrapRequestOptions);
          setUser(meResponse.data.user);
          setCsrfToken(csrfResponse.data.csrfToken);
          setBootstrapError(null);
        } catch (error) {
          if (isAuthenticationFailure(error)) invalidateAuthenticatedSession();
          else handleBootstrapFailure(error);
        }
      } finally {
        setLoading(false);
        refreshPromiseRef.current = null;
      }
    })();

    refreshPromiseRef.current = operation;
    return operation;
  }, [clearAuthenticatedState, handleBootstrapFailure, invalidateAuthenticatedSession]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    window.addEventListener('traceflow:unauthorized', clearAuthenticatedState);
    return () => window.removeEventListener('traceflow:unauthorized', clearAuthenticatedState);
  }, [clearAuthenticatedState]);
  useEffect(() => {
    const handleRestricted = () => void refresh();
    window.addEventListener('traceflow:account-restricted', handleRestricted);
    return () => window.removeEventListener('traceflow:account-restricted', handleRestricted);
  }, [refresh]);
  const authenticate = useCallback(async (operation, values) => {
    const { data } = await operation(values);
    resetHttpSessionScope();
    setUser(data.user);
    setCsrfToken(data.csrfToken);
    setBootstrapError(null);
    return data.user;
  }, []);
  const value = useMemo(
    () => ({
      user,
      loading,
      bootstrapError,
      login: (values) => authenticate(authApi.login, values),
      register: (values) => authenticate(authApi.register, values),
      updateUser: setUser,
      logout: async () => {
        await authApi.logout();
        invalidateAuthenticatedSession();
      },
      refresh
    }),
    [user, loading, bootstrapError, authenticate, invalidateAuthenticatedSession, refresh]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
