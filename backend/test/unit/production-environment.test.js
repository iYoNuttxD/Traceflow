import { describe, expect, it } from 'vitest';
import { createEnvironment, assertWorkerEnvironment } from '../../src/config/env.js';
import { productionEnvironment } from '../helpers/production-environment.js';

const publicKeys = [
  'FRONTEND_URL',
  'CORS_ALLOWED_ORIGINS',
  'PASSWORD_RESET_URL',
  'INVITATION_ACCEPT_URL',
  'EMAIL_VERIFICATION_URL',
  'EMAIL_CHANGE_CONFIRM_URL',
  'ACCOUNT_REACTIVATION_URL',
  'GITHUB_APP_CALLBACK_URL',
  'GITHUB_LOGIN_CALLBACK_URL',
  'GITHUB_APP_FRONTEND_SUCCESS_URL',
  'GITHUB_APP_FRONTEND_ERROR_URL'
];
describe('production environment contract', () => {
  it('accepts the complete production contract with secure defaults', () => {
    expect(createEnvironment(productionEnvironment())).toMatchObject({
      isProduction: true,
      httpHost: '127.0.0.1',
      trustProxy: 'loopback',
      rateLimitProfile: 'production',
      smtpSecure: false,
      smtpPort: 587,
      shutdownTimeoutMs: 30000,
      readinessTimeoutMs: 3000
    });
  });
  it.each(publicKeys)('requires explicit public URL %s and refuses local destinations', (key) => {
    for (const value of [
      undefined,
      'http://localhost:5173',
      'https://localhost',
      'https://127.0.0.1',
      'https://0.0.0.0',
      'https://[::1]',
      'https://2130706433',
      'https://app.localhost',
      'https://user:private@traceflow.example',
      'ftp://traceflow.example'
    ]) {
      expect(() => createEnvironment(productionEnvironment({ [key]: value }))).toThrow();
    }
  });
  it.each([
    'DATABASE_URL',
    'SMTP_PASSWORD',
    'PRIVACY_PSEUDONYMIZATION_KEY',
    'GITHUB_APP_CLIENT_SECRET',
    'GITHUB_APP_PRIVATE_KEY_BASE64',
    'GITHUB_APP_WEBHOOK_SECRET'
  ])('rejects missing %s without exposing values', (key) => {
    const source = productionEnvironment({ [key]: undefined });
    try {
      createEnvironment(source);
      throw new Error('accepted invalid configuration');
    } catch (error) {
      expect(error.message).not.toBe('accepted invalid configuration');
      for (const name of [
        'SMTP_PASSWORD',
        'PRIVACY_PSEUDONYMIZATION_KEY',
        'GITHUB_APP_CLIENT_SECRET'
      ])
        if (source[name]) expect(error.message).not.toContain(source[name]);
    }
  });
  it.each(['0.0.0.0', '::', 'localhost', '10.20.1.5', '::1'])(
    'rejects production HTTP_HOST=%s',
    (host) => {
      expect(() => createEnvironment(productionEnvironment({ HTTP_HOST: host }))).toThrow(
        /HTTP_HOST/
      );
    }
  );
  it.each(['true', 'false', '1', '2', 'uniquelocal', undefined])(
    'requires exact loopback proxy trust (%s)',
    (value) => {
      expect(() => createEnvironment(productionEnvironment({ TRUST_PROXY: value }))).toThrow(
        /TRUST_PROXY/
      );
    }
  );
  it('rejects a development limiter, non-origin CORS and absent storage', () => {
    for (const overrides of [
      { RATE_LIMIT_PROFILE: 'development' },
      { FRONTEND_URL: 'https://traceflow.example/path' },
      { CORS_ALLOWED_ORIGINS: '*' },
      { CORS_ALLOWED_ORIGINS: 'https://other.example' },
      { TEST_EVIDENCE_STORAGE_DIR: 'relative' },
      { TEST_EVIDENCE_STORAGE_DIR: undefined }
    ])
      expect(() => createEnvironment(productionEnvironment(overrides))).toThrow();
  });
  it('keeps intentional local development and worker opt-out', () => {
    const config = createEnvironment({
      DATABASE_URL: 'mysql://unused@localhost/dev',
      FRONTEND_URL: 'http://localhost:5173'
    });
    expect(config).toMatchObject({
      isDevelopment: true,
      httpHost: undefined,
      trustProxy: false,
      emailProvider: 'capture'
    });
    expect(() => assertWorkerEnvironment(config)).not.toThrow();
    expect(() => assertWorkerEnvironment(createEnvironment(productionEnvironment()))).toThrow(
      /GITHUB_SCHEDULER_ENABLED/
    );
    expect(() =>
      assertWorkerEnvironment(
        createEnvironment(productionEnvironment({ GITHUB_SCHEDULER_ENABLED: 'true' }))
      )
    ).not.toThrow();
  });
  it('validates SMTP modes and bounded timeouts', () => {
    expect(createEnvironment(productionEnvironment({ SMTP_PORT: '465' })).smtpSecure).toBe(true);
    for (const overrides of [
      { SMTP_PORT: '465', SMTP_SECURE: 'false' },
      { SMTP_PORT: '587', SMTP_SECURE: 'true' },
      { SMTP_CONNECTION_TIMEOUT_MS: '0' },
      { SMTP_GREETING_TIMEOUT_MS: 'invalid' },
      { SMTP_SOCKET_TIMEOUT_MS: '999999' }
    ])
      expect(() => createEnvironment(productionEnvironment(overrides))).toThrow(/SMTP/);
  });
});
