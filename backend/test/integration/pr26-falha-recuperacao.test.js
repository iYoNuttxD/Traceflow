import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

const boundary = vi.hoisted(() => ({ client: null }));
const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn()
}));
vi.mock('../../src/shared/logger/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  logger: loggerMock
}));
vi.mock('../../src/modules/github/github.client.js', () => ({
  githubInstallationClientFactory: { forInstallation: () => boundary.client }
}));

let prisma;
let runs;
let executeRun;
let disconnectRecovery;
let sequence = 0;
const LEASE_MS = 30 * 60 * 1000;

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ githubSyncRunRepository: runs } =
    await import('../../src/modules/github/github-sync-run.repository.js'));
  ({ executeGithubSyncRun: executeRun } =
    await import('../../src/modules/github/services/github-sync-run.service.js'));
  ({ disconnectRecoveryPrisma: disconnectRecovery } =
    await import('../../src/database/recovery-prisma.js'));
});
beforeEach(async () => {
  await cleanTestDatabase(prisma);
  boundary.client = {
    getRepository: vi.fn(async () => {
      throw Object.assign(new Error('GitHub indisponível'), { status: 502 });
    })
  };
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await disconnectRecovery();
  await prisma.$disconnect();
});

async function fixture({ claimed = true } = {}) {
  sequence += 1;
  const user = await prisma.user.create({
    data: {
      name: `Dona da sincronização ${sequence}`,
      email: `pr26-recuperacao-${sequence}@example.invalid`,
      username: `pr26recuperacao${sequence}`,
      passwordHash: 'fixture',
      emailVerifiedAt: new Date()
    }
  });
  const installation = await prisma.gitHubInstallation.create({
    data: {
      githubInstallationId: String(1000 + sequence),
      accountId: String(1000 + sequence),
      accountLogin: 'fixture',
      accountType: 'User',
      installedAt: new Date(),
      status: 'ACTIVE'
    }
  });
  const project = await prisma.project.create({
    data: {
      name: `Projeto da recuperação ${sequence}`,
      accessCode: `PR26-REC-${sequence}`,
      responsibleTeam: 'Equipe',
      memberships: { create: { userId: user.id, role: 'OWNER' } },
      githubIntegration: {
        create: {
          installationId: installation.id,
          githubRepositoryId: String(2000 + sequence),
          repositoryName: `repo-${sequence}`,
          repositoryFullName: `fixture/repo-${sequence}`,
          status: 'ACTIVE',
          autoSyncEnabled: true,
          nextSyncAt: new Date()
        }
      }
    }
  });
  const queued = await runs.create(project.id, user.id);
  if (claimed) expect(await runs.claim(queued.id, new Date())).toBe(true);
  return { user, installation, project, run: await runs.findById(queued.id) };
}

function failure(finishedAt, overrides = {}) {
  return {
    errorCode: 'GITHUB_SYNC_STORAGE_FAILED',
    errorMessage: 'Não foi possível gravar os dados da sincronização.',
    finishedAt,
    durationMs: 10,
    ...overrides
  };
}

const integrationOf = (projectId) =>
  prisma.projectGitHubIntegration.findUnique({
    where: { projectId },
    include: { installation: true }
  });

describe('PR26 TF-REV-003: falha gravada pela conexão de recuperação', () => {
  it('R-01 lease perdida não grava nada', async () => {
    const { run } = await fixture();
    const stale = new Date(Date.now() - LEASE_MS - 60000);
    await prisma.gitHubSyncRun.update({ where: { id: run.id }, data: { heartbeatAt: stale } });

    const result = await runs.failOnRecoveryConnection(run.id, failure(new Date()));

    expect(result).toBeNull();
    expect(await runs.findById(run.id)).toMatchObject({
      status: 'RUNNING',
      errorCode: null,
      activeProjectId: run.projectId
    });
  });

  it('R-02 retryAt grava o cooldown da instalação e reagenda depois dele', async () => {
    const { run, project } = await fixture();
    const finishedAt = new Date();
    const retryAt = new Date(finishedAt.getTime() + 60 * 60 * 1000);

    const result = await runs.failOnRecoveryConnection(run.id, failure(finishedAt, { retryAt }));

    expect(result).toMatchObject({ status: 'FAILED', errorCode: 'GITHUB_SYNC_STORAGE_FAILED' });
    const integration = await integrationOf(project.id);
    expect(integration.installation.syncNotBefore.getTime()).toBe(retryAt.getTime());
    expect(integration.nextSyncAt.getTime()).toBeGreaterThanOrEqual(retryAt.getTime());
  });

  it('R-03 falha permanente pede reconexão e tira da agenda', async () => {
    const { run, project } = await fixture();

    await runs.failOnRecoveryConnection(run.id, failure(new Date(), { permanent: true }));

    const integration = await integrationOf(project.id);
    expect(integration.status).toBe('RECONNECT_REQUIRED');
    expect(integration.nextSyncAt).toBeNull();
  });

  it('R-04 falha comum soma a falha consecutiva e reagenda com recuo', async () => {
    const { run, project } = await fixture();
    const finishedAt = new Date();

    await runs.failOnRecoveryConnection(run.id, failure(finishedAt));

    const integration = await integrationOf(project.id);
    expect(integration.consecutiveSyncFailures).toBe(1);
    expect(integration.nextSyncAt).not.toBeNull();
    expect(integration.nextSyncAt.getTime()).toBeGreaterThan(finishedAt.getTime());
    expect(await runs.findById(run.id)).toMatchObject({
      status: 'FAILED',
      activeProjectId: null,
      automaticSlot: null
    });
  });

  it('R-05 execução já terminada, com sucesso ou expirada, não muda', async () => {
    const succeeded = await fixture();
    await prisma.gitHubSyncRun.update({
      where: { id: succeeded.run.id },
      data: { status: 'SUCCEEDED', step: 'COMPLETED', activeProjectId: null }
    });
    const expired = await fixture();
    await prisma.gitHubSyncRun.update({
      where: { id: expired.run.id },
      data: {
        status: 'FAILED',
        activeProjectId: null,
        errorCode: 'GITHUB_SYNC_STALE',
        errorMessage: 'A execução foi interrompida antes da conclusão.'
      }
    });

    expect(await runs.failOnRecoveryConnection(succeeded.run.id, failure(new Date()))).toBeNull();
    expect(await runs.failOnRecoveryConnection(expired.run.id, failure(new Date()))).toBeNull();

    expect(await runs.findById(succeeded.run.id)).toMatchObject({
      status: 'SUCCEEDED',
      errorCode: null
    });
    expect(await runs.findById(expired.run.id)).toMatchObject({
      status: 'FAILED',
      errorCode: 'GITHUB_SYNC_STALE'
    });
  });

  it('R-06 projeto ocupado esgota as tentativas e registra a falha não gravada', async () => {
    const { run, project } = await fixture({ claimed: false });
    const lockHeld = Promise.withResolvers();
    const release = Promise.withResolvers();
    let holder;
    boundary.client = {
      getRepository: vi.fn(async () => {
        holder = prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT id FROM Project WHERE id = ${project.id} FOR UPDATE`;
            lockHeld.resolve();
            await release.promise;
          },
          { timeout: 15000 }
        );
        await lockHeld.promise;
        throw Object.assign(new Error('GitHub indisponível'), { status: 502 });
      })
    };
    loggerMock.error.mockImplementation((_, context) => {
      if (context?.event === 'github_sync_run_failure_unrecorded') release.resolve();
    });
    vi.spyOn(runs, 'fail').mockRejectedValue(
      Object.assign(new Error('Transaction already closed'), { code: 'P2028' })
    );
    const recovery = vi.spyOn(runs, 'failOnRecoveryConnection');

    let result;
    try {
      result = await executeRun(run.id);
    } finally {
      release.resolve();
      await holder;
    }

    expect(recovery).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('RUNNING');
    expect(loggerMock.error).toHaveBeenCalledWith(
      'Não foi possível registrar a falha da execução GitHub.',
      expect.objectContaining({ event: 'github_sync_run_failure_unrecorded', runId: run.id })
    );
    expect(await runs.findById(run.id)).toMatchObject({ status: 'RUNNING', errorCode: null });
  }, 30000);

  it('R-07 retomada concorrente: a execução antiga não muda e a nova segue intacta', async () => {
    const { run, project, user } = await fixture();
    await prisma.gitHubSyncRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        activeProjectId: null,
        errorCode: 'GITHUB_SYNC_STALE',
        errorMessage: 'A execução foi interrompida antes da conclusão.'
      }
    });
    const next = await runs.create(project.id, user.id);
    expect(await runs.claim(next.id, new Date())).toBe(true);

    expect(await runs.failOnRecoveryConnection(run.id, failure(new Date()))).toBeNull();

    expect(await runs.findById(run.id)).toMatchObject({
      status: 'FAILED',
      errorCode: 'GITHUB_SYNC_STALE'
    });
    expect(await runs.findById(next.id)).toMatchObject({
      status: 'RUNNING',
      activeProjectId: project.id,
      errorCode: null
    });
  });
});
