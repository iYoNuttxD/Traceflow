export function sanitizeInternalReturnTo(value, fallback = '/projects') {
  const internalOrigin = 'https://traceflow.invalid';
  if (typeof value !== 'string' || value.length === 0 || value.length > 191) return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  const hasControlCharacter = (candidate) =>
    [...candidate].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    });
  const hasDotSegment = (candidate) =>
    candidate
      .split(/[?#]/, 1)[0]
      .split('/')
      .some((segment) => segment === '.' || segment === '..');
  if (hasControlCharacter(value) || hasDotSegment(value)) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (
      !decoded.startsWith('/') ||
      decoded.startsWith('//') ||
      decoded.includes('\\') ||
      hasControlCharacter(decoded) ||
      hasDotSegment(decoded)
    )
      return fallback;
    const url = new URL(value, internalOrigin);
    if (
      url.origin !== internalOrigin ||
      !url.pathname.startsWith('/') ||
      url.pathname.startsWith('//') ||
      url.pathname.includes('\\')
    )
      return fallback;
    const normalized = `${url.pathname}${url.search}${url.hash}`;
    if (!normalized.startsWith('/') || normalized.startsWith('//') || normalized.includes('\\'))
      return fallback;
    const reparsed = new URL(normalized, internalOrigin);
    return reparsed.origin === internalOrigin &&
      `${reparsed.pathname}${reparsed.search}${reparsed.hash}` === normalized
      ? normalized
      : fallback;
  } catch {
    return fallback;
  }
}

export function locationReturnTo(location) {
  return sanitizeInternalReturnTo(`${location.pathname}${location.search}${location.hash}`);
}
