import { randomBytes } from 'node:crypto';

// Synthetic values used only by controlled tests. No real configuration is read.
export function productionEnvironment(overrides = {}) {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'mysql://unused@127.0.0.1:1/unused_test',
    FRONTEND_URL: 'https://traceflow.example',
    CORS_ALLOWED_ORIGINS: 'https://traceflow.example',
    TRUST_PROXY: 'loopback',
    HTTP_HOST: '127.0.0.1',
    EMAIL_PROVIDER: 'smtp',
    EMAIL_FROM: 'no-reply@traceflow.example',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: '587',
    SMTP_USER: 'test-only',
    SMTP_PASSWORD: randomBytes(32).toString('hex'),
    PRIVACY_PSEUDONYMIZATION_KEY: randomBytes(32).toString('hex'),
    PASSWORD_RESET_URL: 'https://traceflow.example/reset-password',
    INVITATION_ACCEPT_URL: 'https://traceflow.example/invitations/accept',
    EMAIL_VERIFICATION_URL: 'https://traceflow.example/verify-email',
    EMAIL_CHANGE_CONFIRM_URL: 'https://traceflow.example/settings/account/email-change/confirm',
    ACCOUNT_REACTIVATION_URL: 'https://traceflow.example/account/reactivation/confirm',
    TEST_EVIDENCE_STORAGE_DIR: '/var/lib/traceflow/test-evidence',
    GITHUB_APP_ID: '1',
    GITHUB_APP_CLIENT_ID: 'test-only',
    GITHUB_APP_CLIENT_SECRET: randomBytes(32).toString('hex'),
    GITHUB_APP_SLUG: 'test-only',
    GITHUB_APP_PRIVATE_KEY_BASE64: randomBytes(32).toString('base64'),
    GITHUB_APP_WEBHOOK_SECRET: randomBytes(32).toString('hex'),
    GITHUB_APP_CALLBACK_URL: 'https://traceflow.example/api/github-app/callback',
    GITHUB_LOGIN_CALLBACK_URL: 'https://traceflow.example/api/auth/github/callback',
    GITHUB_APP_FRONTEND_SUCCESS_URL: 'https://traceflow.example/projects?github=connected',
    GITHUB_APP_FRONTEND_ERROR_URL: 'https://traceflow.example/projects?github=error',
    ...overrides
  };
}
