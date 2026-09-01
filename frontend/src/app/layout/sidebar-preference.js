export const SIDEBAR_STORAGE_KEY = 'traceflow.sidebar.collapsed';
export const MOBILE_QUERY = '(max-width: 720px)';
export const TABLET_QUERY = '(min-width: 721px) and (max-width: 1180px)';

export function readSidebarPreference(storage) {
  try {
    const value = (storage || window.localStorage).getItem(SIDEBAR_STORAGE_KEY);
    if (value === 'true') return true;
    if (value === 'false') return false;
    return null;
  } catch {
    return null;
  }
}

export function persistSidebarPreference(collapsed, storage) {
  try {
    (storage || window.localStorage).setItem(SIDEBAR_STORAGE_KEY, String(Boolean(collapsed)));
  } catch {
    // A preferência de apresentação não pode impedir a navegação.
  }
}
