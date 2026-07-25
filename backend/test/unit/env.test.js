import { describe, expect, it } from 'vitest';
import { createEnvironment } from '../../src/config/env.js';

const validSource = {
  NODE_ENV: 'development',
  PORT: '3001',
  DATABASE_URL: 'mysql://user:password@localhost:3306/traceflow',
  FRONTEND_URL: 'http://localhost:5173'
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
      githubRequestTimeoutMs: 15000,
      githubRetryMax: 2,
      trustProxy: false
    });
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('falha sem banco obrigatório e não inclui segredo na mensagem', () => {
    const secret = 'segredo-nao-pode-aparecer';
    expect(() => createEnvironment({ ...validSource, DATABASE_URL: undefined, GITHUB_TOKEN: secret }))
      .toThrowError(/DATABASE_URL/);
    try {
      createEnvironment({ ...validSource, DATABASE_URL: undefined, GITHUB_TOKEN: secret });
    } catch (error) {
      expect(error.message).not.toContain(secret);
    }
  });

  it('rejeita PORT e URLs inválidas', () => {
    expect(() => createEnvironment({ ...validSource, PORT: 'inválida' })).toThrowError(/PORT/);
    expect(() => createEnvironment({ ...validSource, FRONTEND_URL: 'não-é-url' }))
      .toThrowError(/FRONTEND_URL/);
    expect(() => createEnvironment({ ...validSource, DATABASE_URL: 'postgres://db' }))
      .toThrowError(/DATABASE_URL/);
  });

  it('usa TEST_DATABASE_URL no ambiente de teste sem exigir DATABASE_URL', () => {
    const config = createEnvironment({
      NODE_ENV: 'test',
      TEST_DATABASE_URL: 'mysql://user:password@localhost:3306/traceflow_test'
    });
    expect(config.databaseUrl).toBe(config.testDatabaseUrl);
    expect(config.isTest).toBe(true);
  });

  it('exige token GitHub somente em produção', () => {
    expect(() => createEnvironment({ ...validSource, NODE_ENV: 'production' }))
      .toThrowError(/GITHUB_TOKEN/);
    expect(createEnvironment({
      ...validSource,
      NODE_ENV: 'production',
      GITHUB_TOKEN: 'fake',
      CORS_ALLOWED_ORIGINS: 'https://traceflow.example',
      EMAIL_PROVIDER: 'smtp', EMAIL_FROM: 'no-reply@traceflow.example',
      SMTP_HOST: 'smtp.traceflow.example', SMTP_USER: 'mailer', SMTP_PASSWORD: 'secret'
    }))
      .toMatchObject({ isProduction: true });
  });

  it('valida o provedor de e-mail sem revelar credenciais', () => {
    expect(createEnvironment(validSource)).toMatchObject({ emailProvider: 'capture' });
    expect(() => createEnvironment({ ...validSource, EMAIL_PROVIDER: 'smtp', EMAIL_FROM: 'invalid' }))
      .toThrowError(/EMAIL_FROM/);
    expect(() => createEnvironment({ ...validSource, EMAIL_PROVIDER: 'smtp', EMAIL_FROM: 'mail@example.com' }))
      .toThrowError(/SMTP_HOST/);
  });

  it('valida configuração de segurança sem expor valores', () => {
    expect(() => createEnvironment({
      ...validSource,
      NODE_ENV: 'production',
      GITHUB_TOKEN: 'fake'
    })).toThrowError(/CORS_ALLOWED_ORIGINS/);
    expect(() => createEnvironment({ ...validSource, BODY_LIMIT: '100gb' }))
      .toThrowError(/BODY_LIMIT/);
    expect(() => createEnvironment({ ...validSource, RATE_LIMIT_MAX: '0' }))
      .toThrowError(/RATE_LIMIT_MAX/);
    expect(() => createEnvironment({ ...validSource, TRUST_PROXY: 'true' }))
      .toThrowError(/TRUST_PROXY/);
    expect(() => createEnvironment({ ...validSource, CORS_ALLOWED_ORIGINS: '*' }))
      .toThrowError(/CORS_ALLOWED_ORIGINS/);
  });
});
