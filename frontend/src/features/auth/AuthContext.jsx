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
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState(null);
  const refreshPromiseRef = useRef(null);
  const clear = useCallback(() => {
    resetHttpSessionScope();
    setCsrfToken();
    setUser(null);
    setBootstrapError(null);
  }, []);
  const refresh = useCallback(() => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const operation = (async () => {
      try {
        const [meResult, csrfResult] = await Promise.allSettled([authApi.me(), authApi.csrf()]);

        if (meResult.status === 'fulfilled' && csrfResult.status === 'fulfilled') {
          setUser(meResult.value.data.user);
          setCsrfToken(csrfResult.value.data.csrfToken);
          setBootstrapError(null);
          return;
        }

        const failures = [meResult, csrfResult]
          .filter((result) => result.status === 'rejected')
          .map((result) => result.reason);
        const nonSessionFailure = failures.find((error) => !isAuthenticationFailure(error));

        if (
          meResult.status === 'rejected' &&
          isAuthenticationFailure(meResult.reason) &&
          !nonSessionFailure
        ) {
          clear();
        } else {
          const error =
            failures.find((failure) => isNetworkOrServiceUnavailable(failure)) ||
            nonSessionFailure ||
            failures[0];
          const unavailable = isNetworkOrServiceUnavailable(error);
          const normalized = normalizeApiError(error, 'Não foi possível verificar sua sessão.');
          const isRateLimit = normalized.status === 429;
          setBootstrapError({
            type: unavailable ? PAGE_ERROR_TYPES.NETWORK : classifyPageError(error),
            message: isRateLimit
              ? normalized.message
              : unavailable
                ? 'Não foi possível conectar ao servidor do TRACEFLOW. Tente novamente em instantes.'
                : 'Não foi possível verificar sua sessão. Tente novamente em instantes.',
            requestId: getErrorRequestId(error),
            isRateLimit,
            retryAfterSeconds: normalized.retryAfterSeconds
          });
        }
      } finally {
        setLoading(false);
        refreshPromiseRef.current = null;
      }
    })();

    refreshPromiseRef.current = operation;
    return operation;
  }, [clear]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    window.addEventListener('traceflow:unauthorized', clear);
    return () => window.removeEventListener('traceflow:unauthorized', clear);
  }, [clear]);
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
        clear();
      },
      refresh
    }),
    [user, loading, bootstrapError, authenticate, clear, refresh]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
