import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createProject } from '../fixtures/factories.js';

let prisma;
let serializableTransaction;
let traceabilityTransaction;
let limitLockWaits;
let PrismaClient;

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ serializableTransaction } = await import('../../src/database/serializable-transaction.js'));
  ({ traceabilityTransaction } =
    await import('../../src/modules/traceability/requirement-reconciliation.repository.js'));
  ({ limitLockWaits } = await import('../../src/database/lock-wait.js'));
  ({ PrismaClient } = await import('@prisma/client'));
}, 60000);

afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

const sessionLimit = async (tx) =>
  Number((await tx.$queryRaw`SELECT @@SESSION.innodb_lock_wait_timeout AS value`)[0].value);

describe('S202-F29 — F1-05 e F1-06 limite na sessão de toda transação interativa', () => {
  it('F1-05 o cliente compartilhado define o limite pela regra em cada classe de transação', async () => {
    const project = await createProject(prisma);
    const measured = {
      padrao: await prisma.$transaction(sessionLimit),
      quinzeSegundos: await prisma.$transaction(sessionLimit, { timeout: 15000 }),
      serializableDireta: await prisma.$transaction(sessionLimit, {
        isolationLevel: 'Serializable'
      }),
      serializableTransaction: await serializableTransaction(sessionLimit),
      traceabilityTransaction: await traceabilityTransaction(
        { projectId: project.id },
        sessionLimit
      ),
      tresSegundos: await prisma.$transaction(sessionLimit, { timeout: 3000 }),
      sessentaSegundos: await prisma.$transaction(sessionLimit, { timeout: 60000 }),
      depoisDaDeQuinze: await prisma.$transaction(sessionLimit),
      clienteEstendido: await prisma.$extends({}).$transaction(sessionLimit)
    };

    expect(measured).toMatchObject({
      padrao: 2,
      quinzeSegundos: 5,
      traceabilityTransaction: 5,
      serializableDireta: 2,
      serializableTransaction: 2,
      tresSegundos: 1,
      sessentaSegundos: 5,
      depoisDaDeQuinze: 2,
      clienteEstendido: 2
    });
  });

  it('F1-06 a forma interativa começa pelo limite; a forma em lote não recebe a instrução', async () => {
    const queries = [];
    const client = limitLockWaits(new PrismaClient({ log: [{ emit: 'event', level: 'query' }] }));
    client.$on('query', (event) => queries.push(event.query));

    try {
      await client.$transaction(async (tx) => tx.$queryRaw`SELECT 1 AS um`);
      const interactive = queries.splice(0);
      await client.$transaction([client.$queryRaw`SELECT 2 AS dois`]);
      const batch = queries.splice(0);

      const statements = (list) => list.filter((query) => !/^(BEGIN|COMMIT|ROLLBACK)/i.test(query));
      expect(statements(interactive)[0]).toBe('SET SESSION innodb_lock_wait_timeout = 2');
      expect(statements(interactive)[1]).toMatch(/SELECT 1/);
      expect(batch.some((query) => /innodb_lock_wait_timeout/.test(query))).toBe(false);
    } finally {
      await client.$disconnect();
    }
  });
});
