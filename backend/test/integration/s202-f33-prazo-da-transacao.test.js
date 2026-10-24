import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createProject } from '../fixtures/factories.js';
import { slowQuery, slowUpdate } from '../helpers/slow-statement.js';

const loggerMock = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}));
vi.mock('../../src/shared/logger/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  logger: loggerMock
}));

let prisma;
let createPrismaClient;
let disconnectRecoveryPrisma;
let guardTransactions;
let settleDeadlineMs;
let PrismaClient;
let sequence = 0;

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma, createPrismaClient } = await import('../../src/database/prismaClient.js'));
  ({ disconnectRecoveryPrisma } = await import('../../src/database/recovery-prisma.js'));
  ({ guardTransactions, settleDeadlineMs } =
    await import('../../src/database/transaction-guard.js'));
  ({ PrismaClient } = await import('@prisma/client'));
}, 60000);

afterEach(async () => {
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
  await disconnectRecoveryPrisma();
});

const ALL_RIGHT = { update: 'ok', read: 'ok', select: 'ok', create: 'ok' };
// Keep the default interruption in F1-01 and both real default/custom success
// windows in F1-05. Other rounds exercise the same real MySQL failure paths
// with the public transaction options, without mocking clocks or recovery.
const SHORT_TRANSACTION = { timeout: 1000 };
const SHORT_QUERY_SECONDS = 3;
const HARD_TRANSACTION = { timeout: 1000, maxWait: 1000 };
const HARD_QUERY_SECONDS = 9;

async function fixture() {
  sequence += 1;
  const project = await createProject(prisma);
  const user = await prisma.user.create({
    data: {
      name: 'Pessoa original',
      username: `s202f33int${sequence}`,
      email: `s202-f33-int-${sequence}@example.invalid`
    }
  });
  return { project, user };
}

async function outcomeOf(run, isRight) {
  try {
    return isRight(await run()) ? 'ok' : 'errado';
  } catch (error) {
    return String(error.code ?? error.name);
  }
}

async function probe(client, { project, user }) {
  const rows = [];
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    rows.push({
      update: await outcomeOf(
        () =>
          client.user.update({
            where: { id: user.id },
            data: { name: `Sonda ${attempt}` },
            select: { id: true }
          }),
        (value) => value?.id === user.id
      ),
      read: await outcomeOf(
        () => client.project.findUnique({ where: { id: project.id }, select: { id: true } }),
        (value) => value?.id === project.id
      ),
      select: await outcomeOf(
        () => client.$queryRawUnsafe(`SELECT ${attempt * 7} AS v`),
        (value) => Number(value?.[0]?.v) === attempt * 7
      ),
      create: await outcomeOf(
        () =>
          client.auditEvent.create({
            data: {
              action: 'S202_F33_PROBE',
              resourceType: 'User',
              resourceId: String(user.id),
              projectId: project.id,
              retentionUntil: new Date(Date.now() + 86400000)
            },
            select: { id: true }
          }),
        (value) => Number.isInteger(value?.id)
      )
    });
  }
  return rows;
}

async function timed(run) {
  const started = performance.now();
  const outcome = await run().then(
    (value) => ({ value, error: null }),
    (error) => ({ value: undefined, error })
  );
  return { ...outcome, ms: Math.round(performance.now() - started) };
}

async function storedName(userId) {
  return (await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })).name;
}

function expectDeadline(error, timeoutMs = 5000) {
  expect(error?.name, String(error?.message).slice(0, 200)).toBe('TransactionDeadlineError');
  expect(error.code).toBe('TRANSACTION_DEADLINE');
  expect(error.timeoutMs).toBe(timeoutMs);
}

async function withOwnClient(run) {
  const client = createPrismaClient();
  try {
    return await run(client);
  } finally {
    await client.$disconnect();
  }
}

describe('S202-F33 — Fase 1: prazo próprio da transação interativa', () => {
  it('F1-01 consulta pesada depois de gravação: a transação é desfeita antes do prazo do Prisma e quem vem depois recebe resposta certa, em 3 rodadas', async () => {
    const data = await fixture();

    await withOwnClient(async (client) => {
      for (let round = 1; round <= 3; round += 1) {
        const options = round === 1 ? undefined : SHORT_TRANSACTION;
        const timeoutMs = options?.timeout ?? 5000;
        const { error, ms } = await timed(() =>
          client.$transaction(async (tx) => {
            await tx.user.update({ where: { id: data.user.id }, data: { name: 'Gravado antes' } });
            await slowQuery(tx, round === 1 ? undefined : SHORT_QUERY_SECONDS);
            await tx.user.update({ where: { id: data.user.id }, data: { name: 'Gravado depois' } });
          }, options)
        );

        expectDeadline(error, timeoutMs);
        expect(String(error.cause?.meta?.code ?? error.cause?.message)).toMatch(/1317/);
        expect(ms).toBeGreaterThanOrEqual(timeoutMs - 100);
        expect(ms).toBeLessThan(timeoutMs + 1000);
        expect(await storedName(data.user.id)).not.toMatch(/^Gravado/);
        expect(await probe(client, data), `rodada ${round}`).toEqual(Array(4).fill(ALL_RIGHT));
      }
    });
  }, 90000);

  it('F1-02 gravação pesada: desfeita antes do prazo do Prisma, sem contaminar a conexão, em 2 rodadas', async () => {
    const data = await fixture();

    await withOwnClient(async (client) => {
      for (let round = 1; round <= 2; round += 1) {
        const { error, ms } = await timed(() =>
          client.$transaction(async (tx) => {
            await tx.user.update({ where: { id: data.user.id }, data: { name: 'Gravado antes' } });
            await slowUpdate(tx, data.user.id, SHORT_QUERY_SECONDS);
          }, SHORT_TRANSACTION)
        );

        expectDeadline(error, SHORT_TRANSACTION.timeout);
        expect(ms).toBeLessThan(SHORT_TRANSACTION.timeout + 1000);
        expect(await storedName(data.user.id)).not.toMatch(/^(Gravado|pesado)/);
        expect(await probe(client, data), `rodada ${round}`).toEqual(Array(4).fill(ALL_RIGHT));
      }
    });
  }, 90000);

  it('F1-03 instrução que volta sem erro quando interrompida: a transação não confirma', async () => {
    const data = await fixture();

    await withOwnClient(async (client) => {
      const { error } = await timed(() =>
        client.$transaction(async (tx) => {
          await tx.user.update({ where: { id: data.user.id }, data: { name: 'Gravado antes' } });
          await tx.$queryRawUnsafe(`SELECT SLEEP(${SHORT_QUERY_SECONDS}) AS s`);
          await tx.user.update({ where: { id: data.user.id }, data: { name: 'Gravado depois' } });
        }, SHORT_TRANSACTION)
      );

      expectDeadline(error, SHORT_TRANSACTION.timeout);
      expect(await storedName(data.user.id)).toBe('Pessoa original');
      expect(await probe(client, data)).toEqual(Array(4).fill(ALL_RIGHT));
    });
  }, 60000);

  it('F1-04 callback que captura a interrupção e continua: o vigia segue interrompendo, sem P2028', async () => {
    const data = await fixture();
    const caught = [];

    await withOwnClient(async (client) => {
      const { error, ms } = await timed(() =>
        client.$transaction(async (tx) => {
          await tx.user.update({ where: { id: data.user.id }, data: { name: 'Gravado antes' } });
          for (let attempt = 1; attempt <= 2; attempt += 1) {
            try {
              await slowQuery(tx, SHORT_QUERY_SECONDS);
            } catch (failure) {
              caught.push(String(failure.meta?.code ?? failure.code));
            }
          }
          return 'terminou';
        }, SHORT_TRANSACTION)
      );

      expectDeadline(error, SHORT_TRANSACTION.timeout);
      expect(caught).toEqual(['1317', '1317']);
      expect(ms).toBeLessThan(SHORT_TRANSACTION.timeout + 1000);
      expect(await storedName(data.user.id)).toBe('Pessoa original');
      expect(await probe(client, data)).toEqual(Array(4).fill(ALL_RIGHT));
    });
  }, 60000);

  it('F1-05 tempo útil preservado: quem termina dentro do prazo pedido confirma (guarda do ⚑2)', async () => {
    const data = await fixture();
    const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const five = await prisma.$transaction(async (tx) => {
      await pause(4600);
      await tx.user.update({ where: { id: data.user.id }, data: { name: 'Confirmada em 5 s' } });
      return 'confirmada';
    });
    expect(five).toBe('confirmada');
    expect(await storedName(data.user.id)).toBe('Confirmada em 5 s');

    const fifteen = await prisma.$transaction(
      async (tx) => {
        await pause(14600);
        await tx.user.update({ where: { id: data.user.id }, data: { name: 'Confirmada em 15 s' } });
        return 'confirmada';
      },
      { timeout: 15000 }
    );
    expect(fifteen).toBe('confirmada');
    expect(await storedName(data.user.id)).toBe('Confirmada em 15 s');
  }, 60000);
});

describe('S202-F33 — Fase 2: segunda camada', () => {
  it('F2-03 P2028 que escapa do prazo próprio: o prazo duro solta a requisição, a conexão é encerrada, ninguém recebe resposta errada, e 3 rodadas não escalam (TF-REV-013)', async () => {
    const data = await fixture();
    expect(HARD_QUERY_SECONDS * 1000).toBeGreaterThan(settleDeadlineMs(HARD_TRANSACTION));
    const reasons = [];
    const client = guardTransactions(new PrismaClient(), {
      killQuery: async () => {
        throw Object.assign(new Error('KILL QUERY indisponível'), { code: 'KILL_UNAVAILABLE' });
      },
      onUnavailable: (reason) => reasons.push(reason)
    });
    const wrong = ['errado', 'P2025', 'PrismaClientRustPanicError', 'TypeError'];
    const discarded = () =>
      loggerMock.warn.mock.calls.filter(
        ([, fields]) => fields?.event === 'database_connection_discarded'
      ).length;

    try {
      for (let round = 1; round <= 3; round += 1) {
        loggerMock.warn.mockClear();
        const { error, ms } = await timed(() =>
          client.$transaction(async (tx) => {
            await tx.user.update({ where: { id: data.user.id }, data: { name: 'Gravado antes' } });
            await slowQuery(tx, HARD_QUERY_SECONDS);
          }, HARD_TRANSACTION)
        );

        expectDeadline(error, HARD_TRANSACTION.timeout);
        expect(ms, `rodada ${round}`).toBeGreaterThanOrEqual(
          settleDeadlineMs(HARD_TRANSACTION) - 100
        );
        expect(ms, `rodada ${round}`).toBeLessThan(settleDeadlineMs(HARD_TRANSACTION) + 1500);
        expect(reasons.at(-1)).toBe('UNSETTLED_TRANSACTION');
        expect(await storedName(data.user.id)).not.toMatch(/^Gravado/);
        await vi.waitFor(() => expect(discarded()).toBe(1), { timeout: 10000, interval: 100 });
        const rows = await probe(client, data);
        const values = rows.flatMap((row) => Object.values(row));
        expect(
          values.filter((value) => wrong.includes(value)),
          `rodada ${round}: ${JSON.stringify(rows)}`
        ).toEqual([]);
        expect(rows.slice(1), `rodada ${round}`).toEqual(Array(3).fill(ALL_RIGHT));
      }
    } finally {
      await client.$disconnect();
    }

    expect(reasons).toEqual(Array(3).fill('UNSETTLED_TRANSACTION'));
  }, 180000);
});
