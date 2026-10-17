import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createProject } from '../fixtures/factories.js';

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
let serializableTransaction;
let traceabilityTransaction;
let createPrismaClient;
let isLockWaitTimeout;
let commitSuggestionRepository;
let githubSyncFailure;
let getProjectGithubSyncStatus;

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ serializableTransaction } = await import('../../src/database/serializable-transaction.js'));
  ({ traceabilityTransaction } =
    await import('../../src/modules/traceability/requirement-reconciliation.repository.js'));
  ({ isLockWaitTimeout } = await import('../../src/database/lock-wait.js'));
  ({ createPrismaClient } = await import('../../src/database/prismaClient.js'));
  ({ commitSuggestionRepository } =
    await import('../../src/modules/traceability/commit-suggestion.repository.js'));
  ({ githubSyncFailure } = await import('../../src/modules/github/github-error.js'));
  ({ getProjectGithubSyncStatus } =
    await import('../../src/modules/github/services/github-sync-run.service.js'));
}, 60000);

afterEach(async () => {
  await cleanTestDatabase(prisma);
});

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
    const client = createPrismaClient({ log: [{ emit: 'event', level: 'query' }] });
    client.$on('query', (event) => queries.push(event.query));

    try {
      await client.$transaction(async (tx) => tx.$queryRaw`SELECT 1 AS um`);
      const interactive = queries.splice(0);
      await client.$transaction([client.$queryRaw`SELECT 2 AS dois`]);
      const batch = queries.splice(0);

      const statements = (list) => list.filter((query) => !/^(BEGIN|COMMIT|ROLLBACK)/i.test(query));
      expect(statements(interactive)[0]).toBe('SET SESSION innodb_lock_wait_timeout = 2');
      expect(statements(interactive)[1]).toBe('SELECT CONNECTION_ID() AS id');
      expect(statements(interactive)[2]).toMatch(/SELECT 1/);
      expect(batch.some((query) => /innodb_lock_wait_timeout/.test(query))).toBe(false);
    } finally {
      await client.$disconnect();
    }
  });
});

describe('S202-F29 — Fase 2: espera esgotada fora do HTTP', () => {
  function hold(projectId, maxMs) {
    let release;
    const released = new Promise((resolve) => {
      release = resolve;
    });
    let ready;
    const locked = new Promise((resolve) => {
      ready = resolve;
    });
    const done = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM Project WHERE id = ${projectId} FOR UPDATE`;
        ready();
        await Promise.race([released, new Promise((resolve) => setTimeout(resolve, maxMs))]);
      },
      { timeout: 30000, maxWait: 5000 }
    );
    return { locked, release: () => release(), done };
  }

  async function underLock(projectId, maxMs, attempt) {
    const holder = hold(projectId, maxMs);
    await holder.locked;
    const started = performance.now();
    try {
      const outcome = await attempt().then(
        (value) => ({ value }),
        (error) => ({ error })
      );
      return { ...outcome, ms: Math.round(performance.now() - started) };
    } finally {
      holder.release();
      await holder.done;
    }
  }

  it('F2-04 serializableTransaction não repete a espera esgotada', async () => {
    const project = await createProject(prisma);
    let attempts = 0;

    const { error } = await underLock(project.id, 7000, () =>
      serializableTransaction(async (tx) => {
        attempts += 1;
        return tx.project.findUnique({ where: { id: project.id } });
      })
    );

    expect(isLockWaitTimeout(error)).toBe(true);
    expect(attempts).toBe(1);
  }, 30000);

  it('F2-05 a gravação de sugestões de commit falha em menos de 3,5 s e a sincronização a classifica como projeto ocupado', async () => {
    const project = await createProject(prisma);

    const { error, ms } = await underLock(project.id, 7000, () =>
      commitSuggestionRepository.createMany([{ projectId: project.id }])
    );

    expect(ms).toBeLessThan(3500);
    expect(isLockWaitTimeout(error)).toBe(true);
    expect(githubSyncFailure(error).code).toBe('GITHUB_SYNC_PROJECT_BUSY');
  }, 30000);

  it('F2-06 a leitura do estado com o projeto travado não cai nem expira a execução vencida; liberada a trava, a leitura seguinte expira', async () => {
    const project = await createProject(prisma);
    const owner = await prisma.user.create({
      data: {
        name: 'Pessoa sincronização',
        username: `s202f29sync${project.id}`,
        email: `s202-f29-sync-${project.id}@example.invalid`
      }
    });
    const installation = await prisma.gitHubInstallation.create({
      data: {
        githubInstallationId: `s202-f29-${project.id}`,
        accountId: `s202-f29-account-${project.id}`,
        accountLogin: 'usuario-s202',
        accountType: 'User',
        installedAt: new Date(),
        status: 'ACTIVE'
      }
    });
    await prisma.projectGitHubIntegration.create({
      data: {
        projectId: project.id,
        installationId: installation.id,
        githubRepositoryId: String(99000 + project.id),
        repositoryName: 'repositorio-s202',
        repositoryFullName: 'usuario-s202/repositorio-s202',
        repositoryUrl: 'https://github.com/usuario-s202/repositorio-s202',
        defaultBranch: 'trunk',
        status: 'ACTIVE'
      }
    });
    const old = new Date(Date.now() - 31 * 60 * 1000);
    const run = await prisma.gitHubSyncRun.create({
      data: {
        projectId: project.id,
        requestedByUserId: owner.id,
        activeProjectId: project.id,
        status: 'RUNNING',
        step: 'COMMITS',
        startedAt: old,
        heartbeatAt: old
      }
    });

    const { value, error, ms } = await underLock(project.id, 8000, () =>
      getProjectGithubSyncStatus(project.id)
    );

    expect(error).toBeUndefined();
    expect(ms).toBeLessThan(3500);
    expect(value).toMatchObject({ id: run.id, status: 'RUNNING' });
    expect(
      await prisma.gitHubSyncRun.findUnique({ where: { id: run.id }, select: { status: true } })
    ).toEqual({ status: 'RUNNING' });

    expect(await getProjectGithubSyncStatus(project.id)).toMatchObject({
      id: run.id,
      status: 'FAILED',
      error: { code: 'GITHUB_SYNC_STALE' }
    });
    expect(
      await prisma.projectGitHubIntegration.findUnique({
        where: { projectId: project.id },
        select: { lastSyncStatus: true }
      })
    ).toEqual({ lastSyncStatus: 'FALHA' });
  }, 30000);
});
