import { describe, expect, it } from 'vitest';
import { createEnvironment } from '../../src/config/env.js';

const validSource = {
  NODE_ENV: 'development',
  PORT: '3001',
  DATABASE_URL: 'mysql://user:password@localhost:3306/traceflow',
  FRONTEND_URL: 'http://localhost:5173'
};
const githubAppSource = {
  GITHUB_APP_ID: '123',
  GITHUB_APP_CLIENT_ID: 'Iv1.artificial',
  GITHUB_APP_CLIENT_SECRET: 'client-secret-artificial',
  GITHUB_APP_SLUG: 'traceflow-test',
  GITHUB_APP_PRIVATE_KEY_BASE64: 'Y2hhdmUtYXJ0aWZpY2lhbA==',
  GITHUB_APP_WEBHOOK_SECRET: 'webhook-artificial',
  GITHUB_APP_CALLBACK_URL: 'https://api.traceflow.example/api/github-app/callback',
  GITHUB_LOGIN_CALLBACK_URL: 'https://api.traceflow.example/api/auth/github/callback',
  GITHUB_APP_FRONTEND_SUCCESS_URL: 'https://traceflow.example/projects?github=connected',
  GITHUB_APP_FRONTEND_ERROR_URL: 'https://traceflow.example/projects?github=error'
};
const productionInfrastructure = {
  CORS_ALLOWED_ORIGINS: 'https://traceflow.example',
  EMAIL_PROVIDER: 'smtp',
  EMAIL_FROM: 'no-reply@traceflow.example',
  SMTP_HOST: 'smtp.traceflow.example',
  SMTP_USER: 'mailer',
  SMTP_PASSWORD: 'secret'
};

describe('configuração centralizada', () => {
  it('carrega e congela uma configuração válida', () => {
    const config = createEnvironment(validSource);
    expect(config).toMatchObject({
      nodeEnv: 'development',
      port: 3001,
      frontendUrl: 'http://localhost:5173',
      configurationValid: true,
      bodyLimit: '100kb',
      rateLimitWindowMs: 900000,
      rateLimitMax: 200,
      sensitiveRateLimitMax: 20,
      rateLimitProfile: 'development',
      rateLimitGlobalWindowMs: 60000,
      rateLimitGlobalMax: 4000,
      rateLimitReadBurstWindowMs: 10000,
      rateLimitReadBurstMax: 120,
      rateLimitReadWindowMs: 300000,
      rateLimitReadMax: 1200,
      rateLimitAuthMax: 20,
      rateLimitEmailMax: 5,
      rateLimitSensitiveMax: 20,
      rateLimitExportMax: 3,
      githubRequestTimeoutMs: 15000,
      githubRetryMax: 2,
      githubRetryMaxDelayMs: 60000,
      githubRepositoryAuthorizationTtlMs: 900000,
      trustProxy: false
    });
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('falha sem banco obrigatório e não inclui segredo na mensagem', () => {
    const secret = 'segredo-nao-pode-aparecer';
    expect(() =>
      createEnvironment({
        ...validSource,
        DATABASE_URL: undefined,
        GITHUB_APP_CLIENT_SECRET: secret
      })
    ).toThrowError(/DATABASE_URL/);
    try {
      createEnvironment({
        ...validSource,
        DATABASE_URL: undefined,
        GITHUB_APP_CLIENT_SECRET: secret
      });
    } catch (error) {
      expect(error.message).not.toContain(secret);
    }
  });

  it('rejeita PORT e URLs inválidas', () => {
    expect(() => createEnvironment({ ...validSource, PORT: 'inválida' })).toThrowError(/PORT/);
    expect(() => createEnvironment({ ...validSource, FRONTEND_URL: 'não-é-url' })).toThrowError(
      /FRONTEND_URL/
    );
    expect(() => createEnvironment({ ...validSource, DATABASE_URL: 'postgres://db' })).toThrowError(
      /DATABASE_URL/
    );
  });

  it('valida perfil e valores centralizados de rate limiting', () => {
    const config = createEnvironment({
      ...validSource,
      RATE_LIMIT_PROFILE: 'production',
      RATE_LIMIT_GLOBAL_MAX: '900',
      RATE_LIMIT_READ_MAX: '500',
      RATE_LIMIT_EMAIL_MAX: '4',
      RATE_LIMIT_EXPORT_MAX: '2'
    });
    expect(config).toMatchObject({
      rateLimitProfile: 'production',
      rateLimitGlobalMax: 900,
      rateLimitReadMax: 500,
      rateLimitEmailMax: 4,
      rateLimitExportMax: 2
    });
    expect(() =>
      createEnvironment({ ...validSource, RATE_LIMIT_PROFILE: 'disabled' })
    ).toThrowError(/RATE_LIMIT_PROFILE/);
    expect(() => createEnvironment({ ...validSource, RATE_LIMIT_READ_MAX: '0' })).toThrowError(
      /RATE_LIMIT_READ_MAX/
    );
  });

  it('usa TEST_DATABASE_URL no ambiente de teste sem exigir DATABASE_URL', () => {
    const config = createEnvironment({
      NODE_ENV: 'test',
      TEST_DATABASE_URL: 'mysql://user:password@localhost:3306/traceflow_test'
    });
    expect(config.databaseUrl).toBe(config.testDatabaseUrl);
    expect(config.isTest).toBe(true);
  });

  it('exige configuração completa da GitHub App em produção', () => {
    expect(() =>
      createEnvironment({ ...validSource, ...productionInfrastructure, NODE_ENV: 'production' })
    ).toThrowError(/GitHub App/);
    expect(
      createEnvironment({
        ...validSource,
        NODE_ENV: 'production',
        ...githubAppSource,
        ...productionInfrastructure
      })
    ).toMatchObject({ isProduction: true, githubAppConfigured: true });
  });

  it('separa o callback de login e exige HTTPS em produção', () => {
    const configured = createEnvironment({ ...validSource, ...githubAppSource });
    expect(configured.githubLoginCallbackUrl).toBe(
      'https://api.traceflow.example/api/auth/github/callback'
    );
    expect(() =>
      createEnvironment({
        ...validSource,
        NODE_ENV: 'production',
        ...productionInfrastructure,
        ...githubAppSource,
        GITHUB_LOGIN_CALLBACK_URL: 'http://api.traceflow.example/api/auth/github/callback'
      })
    ).toThrowError(/HTTPS/);
  });

  it('valida o provedor de e-mail sem revelar credenciais', () => {
    expect(createEnvironment(validSource)).toMatchObject({ emailProvider: 'capture' });
    expect(() =>
      createEnvironment({ ...validSource, EMAIL_PROVIDER: 'smtp', EMAIL_FROM: 'invalid' })
    ).toThrowError(/EMAIL_FROM/);
    expect(() =>
      createEnvironment({ ...validSource, EMAIL_PROVIDER: 'smtp', EMAIL_FROM: 'mail@example.com' })
    ).toThrowError(/SMTP_HOST/);
  });

  it('valida configuração de segurança sem expor valores', () => {
    expect(() =>
      createEnvironment({
        ...validSource,
        NODE_ENV: 'production',
        ...githubAppSource
      })
    ).toThrowError(/CORS_ALLOWED_ORIGINS/);
    expect(() => createEnvironment({ ...validSource, BODY_LIMIT: '100gb' })).toThrowError(
      /BODY_LIMIT/
    );
    expect(() => createEnvironment({ ...validSource, RATE_LIMIT_MAX: '0' })).toThrowError(
      /RATE_LIMIT_MAX/
    );
    expect(() => createEnvironment({ ...validSource, TRUST_PROXY: 'true' })).toThrowError(
      /TRUST_PROXY/
    );
    expect(() => createEnvironment({ ...validSource, CORS_ALLOWED_ORIGINS: '*' })).toThrowError(
      /CORS_ALLOWED_ORIGINS/
    );
  });
});
