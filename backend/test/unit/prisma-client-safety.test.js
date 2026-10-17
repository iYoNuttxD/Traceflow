import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { construct, loadEnv } = vi.hoisted(() => ({ construct: vi.fn(), loadEnv: vi.fn() }));
vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    constructor(options) {
      construct(options);
    }
  }
}));
vi.mock('dotenv', () => ({ default: { config: loadEnv } }));
vi.mock('../../src/shared/logger/index.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

const testUrl = 'mysql://fixture:fixture@localhost/traceflow_test';
const developmentUrl = 'mysql://fixture:fixture@localhost/traceflow';
const loadClient = () => import('../../src/database/prismaClient.js');

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('DATABASE_URL', developmentUrl);
  vi.stubEnv('TEST_DATABASE_URL', testUrl);
});
afterEach(() => vi.unstubAllEnvs());

describe('Prisma test datasource isolation without connecting to a database', () => {
  it('pins the test datasource even before suite setup redirects DATABASE_URL', async () => {
    await loadClient();
    expect(process.env.DATABASE_URL).toBe(developmentUrl);
    expect(construct).toHaveBeenCalledExactlyOnceWith({ datasourceUrl: testUrl });
  });

  it.each([
    undefined,
    '',
    developmentUrl,
    'mysql://fixture:fixture@localhost/traceflow_production_test',
    'postgresql://fixture:fixture@localhost/traceflow_test'
  ])('refuses an absent or unsafe test target before client construction: %s', async (target) => {
    vi.stubEnv('TEST_DATABASE_URL', target);
    await expect(loadClient()).rejects.toThrow();
    expect(construct).not.toHaveBeenCalled();
  });

  it('pins the recovery client to the same test datasource, with one connection and a 2 s pool wait', async () => {
    await loadClient();
    const { recoveryPrisma } = await import('../../src/database/recovery-prisma.js');
    expect(construct).toHaveBeenCalledTimes(1);
    recoveryPrisma();
    recoveryPrisma();
    expect(construct).toHaveBeenCalledTimes(2);
    expect(construct).toHaveBeenLastCalledWith({
      datasourceUrl: `${testUrl}?connection_limit=1&pool_timeout=2`
    });
  });

  it('builds the production recovery client from DATABASE_URL, keeping its options', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TEST_DATABASE_URL', undefined);
    vi.stubEnv('DATABASE_URL', `${developmentUrl}?sslaccept=strict`);
    const { recoveryPrisma } = await import('../../src/database/recovery-prisma.js');
    recoveryPrisma();
    expect(construct).toHaveBeenCalledExactlyOnceWith({
      datasourceUrl: `${developmentUrl}?sslaccept=strict&connection_limit=1&pool_timeout=2`
    });
  });

  it('applies DATABASE_POOL_LIMIT to the application client', async () => {
    vi.stubEnv('DATABASE_POOL_LIMIT', '3');
    await loadClient();
    expect(construct).toHaveBeenCalledExactlyOnceWith({
      datasourceUrl: `${testUrl}?connection_limit=3`
    });
  });

  it('applies DATABASE_POOL_LIMIT to the production datasource', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TEST_DATABASE_URL', undefined);
    vi.stubEnv('DATABASE_POOL_LIMIT', '5');
    await loadClient();
    expect(loadEnv).not.toHaveBeenCalled();
    expect(construct).toHaveBeenCalledExactlyOnceWith({
      datasourceUrl: `${developmentUrl}?connection_limit=5`
    });
  });

  it.each(['0', '101', '2.5', 'cinco'])(
    'refuses DATABASE_POOL_LIMIT=%s before client construction',
    async (limit) => {
      vi.stubEnv('DATABASE_POOL_LIMIT', limit);
      await expect(loadClient()).rejects.toThrow('DATABASE_POOL_LIMIT');
      expect(construct).not.toHaveBeenCalled();
    }
  );

  it('keeps the chosen datasource when DATABASE_URL later changes', async () => {
    await loadClient();
    vi.stubEnv('DATABASE_URL', 'mysql://fixture:fixture@localhost/another_development');
    expect(construct).toHaveBeenCalledExactlyOnceWith({ datasourceUrl: testUrl });
  });

  it.each(['development', 'production'])('preserves the %s runtime configuration', async (mode) => {
    vi.stubEnv('NODE_ENV', mode);
    vi.stubEnv('TEST_DATABASE_URL', undefined);
    await loadClient();
    expect(loadEnv).not.toHaveBeenCalled();
    expect(construct).toHaveBeenCalledExactlyOnceWith({});
  });
});
