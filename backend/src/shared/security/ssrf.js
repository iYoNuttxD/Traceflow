import { isIP } from 'node:net';

const blockedIpv4Ranges = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./
];

function isBlockedIp(hostname) {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (isIP(normalized) === 4) return blockedIpv4Ranges.some((pattern) => pattern.test(normalized));
  if (isIP(normalized) === 6) {
    return normalized === '::1' || normalized === '::' || normalized.startsWith('fe80:') ||
      normalized.startsWith('fc') || normalized.startsWith('fd');
  }
  return false;
}

export function isAllowedExternalUrl(value, { allowedHosts = ['github.com', 'api.github.com'] } = {}) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === '443') &&
      hostname !== 'localhost' &&
      !hostname.endsWith('.localhost') &&
      !isBlockedIp(hostname) &&
      allowedHosts.includes(hostname);
  } catch {
    return false;
  }
}

export const isAllowedGithubUrl = (value) => isAllowedExternalUrl(value, {
  allowedHosts: ['github.com', 'api.github.com']
});
