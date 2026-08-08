export function sanitizeInternalReturnTo(value, fallback = '/projects') {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//'))
    return fallback;
  if (value.includes('\\') || value.length > 191) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith('//') || decoded.includes('\\')) return fallback;
    const url = new URL(value, 'https://traceflow.invalid');
    return url.origin === 'https://traceflow.invalid'
      ? `${url.pathname}${url.search}${url.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}

export function locationReturnTo(location) {
  return sanitizeInternalReturnTo(`${location.pathname}${location.search}${location.hash}`);
}
