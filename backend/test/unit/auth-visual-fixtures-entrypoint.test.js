import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const backendRoot = fileURLToPath(new URL('../../', import.meta.url));
const entrypoint = fileURLToPath(new URL('../../scripts/auth-visual-fixtures.js', import.meta.url));
const disposablePassword = 'entrypoint-fixture-password';

function safeEnvironment(overrides = {}) {
  return {
    ...process.env,
    NODE_ENV: 'test',
    AUTH_VISUAL_FIXTURES: 'true',
    EMAIL_PROVIDER: 'capture',
    DATABASE_URL: 'mysql://development:local@localhost:3306/traceflow_development',
    TEST_DATABASE_URL: 'mysql://fixture:local@localhost:3306/traceflow_entrypoint_test',
    FRONTEND_URL: 'http://localhost:5173',
    EMAIL_VERIFICATION_URL: 'http://localhost:5173/verify-email',
    EMAIL_CHANGE_CONFIRM_URL: 'http://localhost:5173/settings/account/email/confirm',
    ACCOUNT_REACTIVATION_URL: 'http://localhost:5173/reactivate',
    AUTH_VISUAL_FIXTURE_PASSWORD: disposablePassword,
    ...overrides
  };
}

function runEntrypoint(overrides) {
  const env = safeEnvironment(overrides);
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete env[key];
  }
  return spawnSync(process.execPath, [entrypoint], {
    cwd: backendRoot,
    env,
    encoding: 'utf8',
    timeout: 5000
  });
}

describe('entrypoint das fixtures visuais de Auth', () => {
  it.each([
    ['produção', { NODE_ENV: 'production' }, /proibidas/],
    ['desenvolvimento', { NODE_ENV: 'development' }, /NODE_ENV=test/],
    ['sem opt-in', { AUTH_VISUAL_FIXTURES: 'false' }, /AUTH_VISUAL_FIXTURES=true/],
    ['provider externo', { EMAIL_PROVIDER: 'smtp' }, /EMAIL_PROVIDER=capture/],
    ['URL de teste ausente', { TEST_DATABASE_URL: '' }, /obrigatória/],
    ['URL de teste inválida', { TEST_DATABASE_URL: 'not-a-url' }, /URL válida/],
    [
      'protocolo não MySQL',
      { TEST_DATABASE_URL: 'postgresql://fixture:local@localhost/traceflow_entrypoint_test' },
      /usar MySQL/
    ],
    [
      'schema de produção',
      { TEST_DATABASE_URL: 'mysql://fixture:local@localhost/traceflow_production_test' },
      /banco de produção/
    ],
    ['senha curta', { AUTH_VISUAL_FIXTURE_PASSWORD: 'short' }, /ao menos 16 caracteres/],
    ['frontend externo', { FRONTEND_URL: 'https://example.test' }, /FRONTEND_URL/],
    [
      'banco remoto',
      { TEST_DATABASE_URL: 'mysql://fixture:local@db.example.test/traceflow_entrypoint_test' },
      /MySQL local/
    ],
    [
      'schema sem marcador test',
      { TEST_DATABASE_URL: 'mysql://fixture:local@localhost/traceflow_entrypoint' },
      /banco de teste/
    ],
    ['DATABASE_URL inválida', { DATABASE_URL: 'not-a-url' }, /DATABASE_URL não é uma URL válida/],
    [
      'mesmo alvo por alias local',
      {
        DATABASE_URL: 'mysql://development:local@localhost/TraceFlow_Entrypoint_Test',
        TEST_DATABASE_URL: 'mysql://fixture:local@[::1]/traceflow_entrypoint_test'
      },
      /diferente de DATABASE_URL/
    ],
    [
      'callback de verificação externo',
      { EMAIL_VERIFICATION_URL: 'https://example.test/verify-email' },
      /EMAIL_VERIFICATION_URL/
    ],
    [
      'callback de alteração de e-mail externo',
      { EMAIL_CHANGE_CONFIRM_URL: 'https://example.test/settings/account/email/confirm' },
      /EMAIL_CHANGE_CONFIRM_URL/
    ],
    [
      'callback de reativação externo',
      { ACCOUNT_REACTIVATION_URL: 'https://example.test/reactivate' },
      /ACCOUNT_REACTIVATION_URL/
    ],
    [
      'origem divergente na verificação',
      { EMAIL_VERIFICATION_URL: 'http://127.0.0.1:5174/verify-email' },
      /mesma origem local/
    ],
    [
      'origem divergente na alteração de e-mail',
      { EMAIL_CHANGE_CONFIRM_URL: 'http://127.0.0.1:5174/settings/account/email/confirm' },
      /mesma origem local/
    ],
    [
      'origem divergente na reativação',
      { ACCOUNT_REACTIVATION_URL: 'http://127.0.0.1:5174/reactivate' },
      /mesma origem local/
    ]
  ])('aborta no preflight real para %s antes de Prisma', (_name, overrides, message) => {
    const result = runEntrypoint(overrides);
    const output = `${result.stderr}\n${result.stdout}`;

    expect(result.status).not.toBe(0);
    expect(output).toMatch(message);
    expect(output).not.toContain(disposablePassword);
    expect(output).not.toMatch(/PrismaClientInitialization|Can't reach database/);
  });
});
