import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanTestDatabase, validateTestDatabaseUrl } from '../helpers/test-database.js';

afterEach(() => vi.unstubAllEnvs());

describe('proteção do banco de testes', () => {
  it('aceita somente URL MySQL com nome explicitamente de teste', () => {
    expect(
      validateTestDatabaseUrl(
        'mysql://usuario:senha@localhost:3306/traceflow_test',
        'mysql://usuario:senha@localhost:3306/traceflow'
      )
    ).toContain('traceflow_test');
  });

  it.each([
    undefined,
    'not-a-url',
    'postgresql://usuario:senha@localhost/traceflow_test',
    'mysql://usuario:senha@localhost:3306/traceflow',
    'mysql://usuario:senha@localhost:3306/traceflow_production'
  ])('rejeita destino inseguro: %s', (unsafeUrl) => {
    expect(() =>
      validateTestDatabaseUrl(unsafeUrl, 'mysql://usuario:senha@localhost:3306/traceflow')
    ).toThrow();
  });

  it('rejeita a mesma URL usada pelo banco de desenvolvimento', () => {
    const sameUrl = 'mysql://usuario:senha@localhost:3306/traceflow_test';

    expect(() => validateTestDatabaseUrl(sameUrl, sameUrl)).toThrow(
      'deve ser diferente de DATABASE_URL'
    );
  });

  function cleanupClient(databaseName) {
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const query = vi.fn().mockResolvedValue([{ databaseName }]);
    const tx = new Proxy(
      { $queryRaw: query },
      {
        get(target, key) {
          return key in target ? target[key] : { deleteMany };
        }
      }
    );
    const transaction = vi.fn((callback) => callback(tx));
    return { client: { $transaction: transaction }, deleteMany, query };
  }

  it('bloqueia desenvolvimento mesmo quando a variável aponta para testes', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('TEST_DATABASE_URL', 'mysql://fixture:fixture@localhost/traceflow_test');
    vi.stubEnv('DATABASE_URL', 'mysql://fixture:fixture@localhost/traceflow_test');
    const { client, deleteMany, query } = cleanupClient('traceflow');

    await expect(cleanTestDatabase(client)).rejects.toThrow('conexão real');
    expect(query).toHaveBeenCalledOnce();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it.each(['', 'another_test'])(
    'bloqueia conexão desconhecida ou diferente: %s',
    async (schema) => {
      vi.stubEnv('NODE_ENV', 'test');
      vi.stubEnv('TEST_DATABASE_URL', 'mysql://fixture:fixture@localhost/traceflow_test');
      const { client, deleteMany } = cleanupClient(schema);

      await expect(cleanTestDatabase(client)).rejects.toThrow('conexão real');
      expect(deleteMany).not.toHaveBeenCalled();
    }
  );

  it('bloqueia limpeza fora do ambiente test', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('TEST_DATABASE_URL', 'mysql://fixture:fixture@localhost/traceflow_test');
    const { client, deleteMany, query } = cleanupClient('traceflow_test');

    await expect(cleanTestDatabase(client)).rejects.toThrow('NODE_ENV');
    expect(query).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('confere a conexão antes das exclusões na mesma transação', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('TEST_DATABASE_URL', 'mysql://fixture:fixture@localhost/traceflow_test');
    const { client, deleteMany, query } = cleanupClient('traceflow_test');

    await cleanTestDatabase(client);
    expect(deleteMany).toHaveBeenCalledTimes(49);
    expect(query.mock.invocationCallOrder[0]).toBeLessThan(deleteMany.mock.invocationCallOrder[0]);
    expect(client.$transaction).toHaveBeenCalledOnce();
  });
});
