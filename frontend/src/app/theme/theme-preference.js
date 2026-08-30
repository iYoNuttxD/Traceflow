export const THEME_STORAGE_KEY = 'traceflow.theme';
export const DARK_THEME_QUERY = '(prefers-color-scheme: dark)';

export function isTheme(value) {
  return value === 'light' || value === 'dark';
}

export function readStoredTheme(storage) {
  try {
    const value = (storage || window.localStorage).getItem(THEME_STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
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

export function resolveInitialTheme({ storage, matchMedia } = {}) {
  return readStoredTheme(storage) || systemTheme(matchMedia);
}

export function persistTheme(theme, storage) {
  if (!isTheme(theme)) return;
  try {
    (storage || window.localStorage).setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Preferência visual local é best-effort e não impede o uso da aplicação.
  }
}

export function applyTheme(theme, root = document.documentElement) {
  root.dataset.theme = isTheme(theme) ? theme : 'light';
}
