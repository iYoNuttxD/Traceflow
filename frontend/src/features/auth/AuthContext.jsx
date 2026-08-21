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
export const AUTH_SESSION_EVENT_KEY = 'traceflow:auth-session-event';
const bootstrapRequestOptions = Object.freeze({
  // O AuthProvider é o único responsável por interpretar os probes de bootstrap.
  skipGlobalAuthHandling: true
});
let authEventSequence = 0;

function publishAuthSessionEvent(type) {
  if (typeof window === 'undefined') return;
  try {
    authEventSequence += 1;
    window.localStorage.setItem(
      AUTH_SESSION_EVENT_KEY,
      JSON.stringify({ type, at: Date.now(), sequence: authEventSequence })
    );
  } catch {
    // A sincronização entre abas é best-effort; a sessão HttpOnly continua sendo a autoridade.
  }
}

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

  const signOutLocally = useCallback(() => {
    invalidateAuthenticatedSession();
    publishAuthSessionEvent('signed-out');
  }, [invalidateAuthenticatedSession]);

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
    window.addEventListener('traceflow:unauthorized', signOutLocally);
    return () => window.removeEventListener('traceflow:unauthorized', signOutLocally);
  }, [signOutLocally]);
  useEffect(() => {
    const handleRestricted = () => void refresh();
    window.addEventListener('traceflow:account-restricted', handleRestricted);
    return () => window.removeEventListener('traceflow:account-restricted', handleRestricted);
  }, [refresh]);
  useEffect(() => {
    function synchronizeTabs(event) {
      if (event.key !== AUTH_SESSION_EVENT_KEY || !event.newValue) return;
      try {
        const payload = JSON.parse(event.newValue);
        if (payload.type === 'signed-out') invalidateAuthenticatedSession();
        if (payload.type === 'authenticated') {
          resetHttpSessionScope();
          void refresh();
        }
      } catch {
        // Eventos inválidos não alteram a sessão local.
      }
    }
    window.addEventListener('storage', synchronizeTabs);
    return () => window.removeEventListener('storage', synchronizeTabs);
  }, [invalidateAuthenticatedSession, refresh]);
  const authenticate = useCallback(async (operation, values) => {
    const { data } = await operation(values);
    resetHttpSessionScope();
    setUser(data.user);
    setCsrfToken(data.csrfToken);
    setBootstrapError(null);
    publishAuthSessionEvent('authenticated');
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
        signOutLocally();
      },
      refresh
    }),
    [user, loading, bootstrapError, authenticate, refresh, signOutLocally]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
