import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { setCsrfToken } from '../../api/http-client.js';
import { authApi } from './api/auth.api.js';

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const refreshPromiseRef = useRef(null);
  const clear = useCallback(() => {
    setCsrfToken();
    setUser(null);
  }, []);
  const refresh = useCallback(() => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const operation = (async () => {
      try {
        const [{ data: me }, { data: csrf }] = await Promise.all([authApi.me(), authApi.csrf()]);
        setUser(me.user);
        setCsrfToken(csrf.csrfToken);
      } catch {
        clear();
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
  const authenticate = useCallback(async (operation, values) => {
    const { data } = await operation(values);
    setUser(data.user);
    setCsrfToken(data.csrfToken);
    return data.user;
  }, []);
  const value = useMemo(
    () => ({
      user,
      loading,
      login: (values) => authenticate(authApi.login, values),
      register: (values) => authenticate(authApi.register, values),
      logout: async () => {
        await authApi.logout();
        clear();
      },
      refresh
    }),
    [user, loading, authenticate, clear, refresh]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
