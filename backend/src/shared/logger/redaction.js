const sensitiveKeys = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'password',
  'senha',
  'token',
  'githubtoken',
  'github_token',
  'database_url',
  'databaseurl',
  'secret',
  'accesscode',
  'invitelink',
  'authoremail',
  'email'
]);

function isSensitiveKey(key) {
  return (
    sensitiveKeys.has(String(key).replace(/[-\s]/g, '').toLowerCase()) ||
    sensitiveKeys.has(String(key).toLowerCase())
  );
}

export function sanitizeText(value) {
  return String(value)
    .replace(/\b(GITHUB_TOKEN|DATABASE_URL)\b/gi, '[REDACTED_KEY]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/(authorization|password|senha|token|secret)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/(mysql:\/\/)[^\s@]+@/gi, '$1[REDACTED]@');
}

export function redact(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return sanitizeText(value);
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeText(value.message),
      ...(value.code ? { code: sanitizeText(value.code) } : {}),
      ...(value.statusCode ? { statusCode: value.statusCode } : {})
    };
  }

  if (Array.isArray(value)) return value.map((item) => redact(item, seen));

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      isSensitiveKey(key) ? '[REDACTED]' : redact(item, seen)
    ])
  );
}
