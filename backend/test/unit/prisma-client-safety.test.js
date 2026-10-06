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
