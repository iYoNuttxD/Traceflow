import { describe, expect, it } from 'vitest';
import { sanitizeInternalReturnTo } from '../../src/features/auth/return-to.js';

describe('returnTo interno', () => {
  it.each([
    '/projects',
    '/projects/1',
    '/projects/1?tab=members',
    '/projects/1#team',
    '/projects/1?tab=x#section',
    '/settings/account'
  ])('preserva %s', (value) => {
    expect(sanitizeInternalReturnTo(value)).toBe(value);
  });

  it.each([
    'https://evil.com',
    'http://evil.com',
    '//evil.com',
    '/\\evil.com',
    'javascript:alert(1)',
    '/..//evil.com',
    '/.//evil.com',
    '/%2e%2e//evil.com',
    '/%2E%2E//evil.com',
    '/x/..//evil.com',
    '/x/%2e%2e//evil.com'
  ])('rejeita %s', (value) => {
    expect(sanitizeInternalReturnTo(value)).toBe('/projects');
  });
});
