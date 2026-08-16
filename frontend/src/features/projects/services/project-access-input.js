const accessCodePattern = /^TRC-[A-Z0-9]{4,64}$/;

function normalizedCode(value) {
  const code = String(value || '')
    .trim()
    .toUpperCase();
  return accessCodePattern.test(code) ? code : '';
}

export function parseProjectAccessInput(value, frontendOrigin = window.location.origin) {
  const directCode = normalizedCode(value);
  if (directCode) return directCode;

  try {
    const url = new URL(String(value || '').trim());
    if (url.origin !== frontendOrigin || url.username || url.password) return '';
    const match = /^\/join\/([^/]+)\/?$/.exec(url.pathname);
    if (!match) return '';
    return normalizedCode(decodeURIComponent(match[1]));
  } catch {
    return '';
  }
}
