import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState
} from 'react';
import {
  DARK_THEME_QUERY,
  applyTheme,
  persistTheme,
  readStoredTheme,
  resolveInitialTheme
} from './theme-preference.js';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [manualTheme, setManualTheme] = useState(() => readStoredTheme());
  const [theme, setResolvedTheme] = useState(() => resolveInitialTheme());

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (manualTheme || typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia(DARK_THEME_QUERY);
    const synchronizeWithSystem = (event) => setResolvedTheme(event.matches ? 'dark' : 'light');
    media.addEventListener?.('change', synchronizeWithSystem);
    return () => media.removeEventListener?.('change', synchronizeWithSystem);
  }, [manualTheme]);

  const selectTheme = useCallback((nextTheme) => {
    if (nextTheme !== 'light' && nextTheme !== 'dark') return;
    persistTheme(nextTheme);
    setManualTheme(nextTheme);
    setResolvedTheme(nextTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    selectTheme(theme === 'dark' ? 'light' : 'dark');
  }, [selectTheme, theme]);

  const value = useMemo(
    () => ({ theme, selectTheme, toggleTheme }),
    [selectTheme, theme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme deve ser usado dentro de ThemeProvider.');
  return context;
}
