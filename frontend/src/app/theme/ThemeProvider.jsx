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
  isThemePreference,
  nextThemePreference,
  persistTheme,
  resolveInitialTheme,
  resolveTheme
} from './theme-preference.js';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [themeState, setThemeState] = useState(() => resolveInitialTheme());
  const { preference: themePreference, resolvedTheme } = themeState;

  useLayoutEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    if (themePreference !== 'system' || typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia(DARK_THEME_QUERY);
    const synchronizeWithSystem = (event) =>
      setThemeState((current) => ({
        ...current,
        resolvedTheme: event.matches ? 'dark' : 'light'
      }));

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', synchronizeWithSystem);
      return () => media.removeEventListener('change', synchronizeWithSystem);
    }

    if (typeof media.addListener === 'function') {
      media.addListener(synchronizeWithSystem);
      return () => media.removeListener(synchronizeWithSystem);
    }

    return undefined;
  }, [themePreference]);

  const selectTheme = useCallback((nextPreference) => {
    if (!isThemePreference(nextPreference)) return;
    persistTheme(nextPreference);
    setThemeState({
      preference: nextPreference,
      resolvedTheme: resolveTheme(nextPreference)
    });
  }, []);

  const cycleTheme = useCallback(() => {
    selectTheme(nextThemePreference(themePreference));
  }, [selectTheme, themePreference]);

  const value = useMemo(
    () => ({ themePreference, resolvedTheme, selectTheme, cycleTheme }),
    [cycleTheme, resolvedTheme, selectTheme, themePreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme deve ser usado dentro de ThemeProvider.');
  return context;
}
