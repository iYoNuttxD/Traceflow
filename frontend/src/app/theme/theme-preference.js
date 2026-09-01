export const THEME_STORAGE_KEY = 'traceflow.theme';
export const DARK_THEME_QUERY = '(prefers-color-scheme: dark)';
export const THEME_PREFERENCES = ['system', 'light', 'dark'];

export function isThemePreference(value) {
  return THEME_PREFERENCES.includes(value);
}

export function readStoredTheme(storage) {
  try {
    const value = (storage || window.localStorage).getItem(THEME_STORAGE_KEY);
    return isThemePreference(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

export function systemTheme(matchMedia) {
  try {
    const resolveMedia = matchMedia || window.matchMedia.bind(window);
    return resolveMedia(DARK_THEME_QUERY).matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function resolveTheme(preference, matchMedia) {
  if (preference === 'light' || preference === 'dark') return preference;
  return systemTheme(matchMedia);
}

export function resolveInitialTheme({ storage, matchMedia } = {}) {
  const preference = readStoredTheme(storage);
  return {
    preference,
    resolvedTheme: resolveTheme(preference, matchMedia)
  };
}

export function nextThemePreference(preference) {
  const currentIndex = THEME_PREFERENCES.indexOf(preference);
  return THEME_PREFERENCES[(currentIndex + 1) % THEME_PREFERENCES.length];
}

export function persistTheme(preference, storage) {
  if (!isThemePreference(preference)) return;
  try {
    (storage || window.localStorage).setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Preferência visual local é best-effort e não impede o uso da aplicação.
  }
}

export function applyTheme(theme, root = document.documentElement) {
  root.dataset.theme = theme === 'dark' ? 'dark' : 'light';
}
