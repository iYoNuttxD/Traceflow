import { beforeAll, beforeEach, afterEach, afterAll, describe, it, expect, vi } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

const boundary = vi.hoisted(() => ({ client: null }));
vi.mock('../../src/modules/github/github.client.js', () => ({
  githubInstallationClientFactory: { forInstallation: () => boundary.client }
}));
let prisma, runs, requestSync, execute, scheduler, projects, withGuard, commits;
const gate = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const policy = {
  intervalMs: 1800000,
  tickMs: 15000,
  concurrency: 2,
  leaseMs: 1800000,
  backoffMaxMs: 21600000
};
async function* pages(value = []) {
  yield value;
}

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ githubSyncRunRepository: runs } =
    await import('../../src/modules/github/github-sync-run.repository.js'));
  ({ requestProjectGithubSync: requestSync, executeGithubSyncRun: execute } =
    await import('../../src/modules/github/services/github-sync-run.service.js'));
  ({ createGithubSyncScheduler: scheduler } =
    await import('../../src/modules/github/services/github-sync-scheduler.service.js'));
  ({ projectRepository: projects } =
    await import('../../src/modules/projects/project.repository.js'));
  ({ withProjectWriteGuard: withGuard } =
    await import('../../src/modules/projects/project-write-context.js'));
  ({ commitRepository: commits } = await import('../../src/modules/commits/commit.repository.js'));
});
beforeEach(async () => {
  await cleanTestDatabase(prisma);
  boundary.client = {
    getRepository: vi.fn(async (owner, name) => ({
      owner,
      name,
      fullName: `${owner}/${name}`,
      githubRepositoryId: name.slice(5),
      url: `https://github.com/${owner}/${name}`,
      defaultBranch: 'main',
      private: false
    })),
    listBranchPages: () => pages([{ name: 'main', headSha: 'head' }]),
    listCommitPages: () => pages([{ hash: 'commit', message: 'Fixture', date: new Date() }]),
    listPullRequestPages: () => pages(),
    listPullRequestLifecycleEventPages: () => pages(),
    listIssuePages: () => pages()
  };
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function fixture(count = 1, { sameInstallation = false } = {}) {
  const user = await prisma.user.create({
    data: {
      name: 'Scheduler owner',
      email: 'scheduler@example.invalid',
      username: 'scheduler',
      passwordHash: 'fixture',
      emailVerifiedAt: new Date()
    }
  });
  const items = [];
  let installation;
  for (let i = 0; i < count; i++) {
    if (!installation || !sameInstallation)
      installation = await prisma.gitHubInstallation.create({
        data: {
          githubInstallationId: String(i + 1),
          accountId: String(i + 1),
          accountLogin: 'fixture',
          accountType: 'User',
          installedAt: new Date(),
          status: 'ACTIVE'
        }
      });
    items.push(
      await prisma.project.create({
        data: {
          name: `Project ${i}`,
          accessCode: `AUTO-${i}`,
          responsibleTeam: 'Team',
          memberships: { create: { userId: user.id, role: 'OWNER' } },
          githubIntegration: {
            create: {
              installationId: installation.id,
              githubRepositoryId: String(i + 1),
              repositoryName: `repo-${i + 1}`,
              repositoryFullName: `fixture/repo-${i + 1}`,
              status: 'ACTIVE',
              autoSyncEnabled: true,
              nextSyncAt: new Date()
            }
          }
        },
        include: { githubIntegration: true }
      })
    );
  }
  return { user, items };
}
const integration = (id) =>
  prisma.projectGitHubIntegration.findUnique({ where: { projectId: id } });
const worker = (options = {}) => scheduler({ enabled: true, configured: () => true, ...options });

describe('scheduler with real isolated persistence', () => {
  it('reserves the same project once across two scheduler instances and runs the canonical pipeline', async () => {
    const {
      items: [project]
    } = await fixture();
    const entered = gate(),
      release = gate();
    const original = boundary.client.getRepository;
    boundary.client.getRepository = vi.fn(async (...args) => {
      entered.resolve();
      await release.promise;
      return original(...args);
    });
    const a = worker(),
      b = worker();
    try {
      await Promise.all([a.tick(), b.tick()]);
      await entered.promise;
      expect(await prisma.gitHubSyncRun.count()).toBe(1);
      expect(await runs.findActive(project.id)).toMatchObject({
        origin: 'AUTOMATIC',
        requestedByUserId: null,
        status: 'RUNNING'
      });
    } finally {
      release.resolve();
      await Promise.all([a.stop(), b.stop()]);
    }
    expect(boundary.client.getRepository).toHaveBeenCalledOnce();
    expect((await runs.findLatest(project.id)).status).toBe('SUCCEEDED');
    expect((await integration(project.id)).nextSyncAt.getTime()).toBeGreaterThan(
      Date.now() + policy.intervalMs - 1000
    );
    expect(await prisma.commit.count()).toBe(1);
  });

  it.each(['manual-first', 'automatic-first', 'race'])(
    'manual and automatic share one project reservation: %s',
    async (order) => {
      const {
        user,
        items: [project]
      } = await fixture();
      const manual = () => requestSync(project.id, user.id, { schedule: () => {} });
      const auto = () => runs.reserveAutomatic(project.id);
      if (order === 'manual-first') {
        const a = await manual();
        expect(await auto()).toMatchObject({ outcome: 'ALREADY_RUNNING', run: { id: a.id } });
      } else if (order === 'automatic-first') {
        const a = await auto();
        expect(await manual()).toMatchObject({
          id: a.run.id,
          alreadyRunning: true,
          origin: 'AUTOMATIC'
        });
      } else await Promise.all([manual(), auto()]);
      expect(await prisma.gitHubSyncRun.count()).toBe(1);
      expect(await prisma.gitHubSyncRun.count({ where: { activeProjectId: project.id } })).toBe(1);
    }
  );

  it('limits automatic slots across independent transactions without blocking other projects', async () => {
    const { items } = await fixture(4);
    await Promise.all(items.map((p) => runs.reserveAutomatic(p.id)));
    // A collision may defer a contender; another tick can fill a free slot.
    for (const p of items) await runs.reserveAutomatic(p.id);
    const active = await prisma.gitHubSyncRun.findMany({ where: { automaticSlot: { not: null } } });
    expect(active).toHaveLength(2);
    expect(new Set(active.map((r) => r.automaticSlot)).size).toBe(2);
    const released = active[0];
    await execute(released.id);
    const waiting = items.find((p) => !active.some((r) => r.projectId === p.id));
    expect((await runs.reserveAutomatic(waiting.id)).outcome).toBe('RESERVED');
    expect(await prisma.gitHubSyncRun.count({ where: { automaticSlot: { not: null } } })).toBe(2);
  });

  it('serializes automatic jobs sharing an installation', async () => {
    const { items } = await fixture(2, { sameInstallation: true });
    await Promise.all(items.map((p) => runs.reserveAutomatic(p.id)));
    expect(await prisma.gitHubSyncRun.count()).toBe(1);
  });

  it('initializes and preserves distributed schedules across restart; overdue work is redistributed', async () => {
    const { items } = await fixture(12);
    await prisma.projectGitHubIntegration.updateMany({ data: { nextSyncAt: null } });
    const a = worker();
    await a.tick();
    await a.stop();
    const before = await prisma.projectGitHubIntegration.findMany({ orderBy: { id: 'asc' } });
    expect(new Set(before.map((i) => i.nextSyncAt.getTime())).size).toBeGreaterThan(8);
    const b = worker();
    await b.tick();
    await b.stop();
    expect(await prisma.projectGitHubIntegration.findMany({ orderBy: { id: 'asc' } })).toEqual(
      before
    );
    const old = new Date(Date.now() - 7200000);
    await prisma.projectGitHubIntegration.updateMany({ data: { nextSyncAt: old } });
    const c = worker();
    await c.tick();
    await c.stop();
    expect(await prisma.gitHubSyncRun.count()).toBe(0);
    expect((await integration(items[0].id)).nextSyncAt > new Date()).toBe(true);
  });

  it.each([
    'disabled',
    'deleted',
    'purging',
    'disconnected',
    'suspended',
    'removed',
    'without-github'
  ])('never schedules an ineligible project: %s', async (state) => {
    const {
      items: [p]
    } = await fixture();
    if (state === 'disabled') await projects.updateGithubSyncSettings(p.id, false);
    if (state === 'deleted')
      await prisma.project.update({ where: { id: p.id }, data: { deletedAt: new Date() } });
    if (state === 'purging')
      await prisma.project.update({ where: { id: p.id }, data: { purgeStartedAt: new Date() } });
    if (state === 'disconnected')
      await prisma.projectGitHubIntegration.update({
        where: { projectId: p.id },
        data: { status: 'RECONNECT_REQUIRED' }
      });
    if (state === 'suspended' || state === 'removed')
      await prisma.gitHubInstallation.update({
        where: { id: p.githubIntegration.installationId },
        data: { status: state.toUpperCase() }
      });
    if (state === 'without-github')
      await prisma.projectGitHubIntegration.delete({ where: { projectId: p.id } });
    const w = worker();
    await w.tick();
    await w.stop();
    expect(await prisma.gitHubSyncRun.count()).toBe(0);
    expect(boundary.client.getRepository).not.toHaveBeenCalled();
  });

  it('does not start without backend credentials or when the worker is disabled', async () => {
    await fixture();
    for (const options of [{ configured: () => false }, { enabled: false }]) {
      const w = worker(options);
      await w.tick();
      await w.stop();
    }
    expect(await prisma.gitHubSyncRun.count()).toBe(0);
  });

  it('disabling a running automatic sync lets it finish without another schedule', async () => {
    const {
      items: [p]
    } = await fixture();
    const { run } = await runs.reserveAutomatic(p.id);
    const entered = gate(),
      release = gate();
    const original = boundary.client.getRepository;
    boundary.client.getRepository = async (...args) => {
      entered.resolve();
      await release.promise;
      return original(...args);
    };
    const work = execute(run.id);
    try {
      await entered.promise;
      await projects.updateGithubSyncSettings(p.id, false);
      expect((await runs.findById(run.id)).status).toBe('RUNNING');
    } finally {
      release.resolve();
      await work;
    }
    expect((await runs.findById(run.id)).status).toBe('SUCCEEDED');
    expect(await integration(p.id)).toMatchObject({ autoSyncEnabled: false, nextSyncAt: null });
    const updated = await projects.updateGithubSyncSettings(p.id, true);
    expect(updated.githubIntegration.nextSyncAt > new Date()).toBe(true);
  });

  it('does not start an automatic queued job disabled before claim', async () => {
    const {
      items: [p]
    } = await fixture();
    const { run } = await runs.reserveAutomatic(p.id);
    await projects.updateGithubSyncSettings(p.id, false);
    expect(await execute(run.id)).toBeNull();
    expect(await runs.findActive(p.id)).toBeNull();
    expect(boundary.client.getRepository).not.toHaveBeenCalled();
  });

  it('recovers a persisted QUEUED job after the reserving process disappears', async () => {
    const {
      items: [p]
    } = await fixture();
    const { run } = await runs.reserveAutomatic(p.id);
    const w = worker();
    await w.tick();
    await w.stop();
    expect(await runs.findById(run.id)).toMatchObject({ status: 'SUCCEEDED', automaticSlot: null });
  });

  it('expires only one abandoned lease and fences every old artifact transaction after a new claim', async () => {
    const {
      user,
      items: [p]
    } = await fixture();
    const { run } = await runs.reserveAutomatic(p.id);
    await runs.claim(run.id);
    const before = new Date(Date.now() - policy.leaseMs - 1000);
    await prisma.gitHubSyncRun.update({ where: { id: run.id }, data: { heartbeatAt: before } });
    const cutoff = new Date(Date.now() - policy.leaseMs);
    const outcomes = await Promise.all([
      runs.expireIfStillStale(run.id, p.id, cutoff),
      runs.expireIfStillStale(run.id, p.id, cutoff)
    ]);
    expect(outcomes.map((o) => o.count).sort()).toEqual([0, 1]);
    const replacement = await requestSync(p.id, user.id, { schedule: () => {} });
    await runs.claim(replacement.id);
    await expect(
      withGuard(
        p.id,
        (tx) => runs.assertLease(tx, run.id, p.id),
        () => commits.createMany([{ projectId: p.id, hash: 'obsolete' }])
      )
    ).rejects.toMatchObject({ code: 'GITHUB_SYNC_LEASE_LOST' });
    expect(await prisma.commit.count()).toBe(0);
    expect(await runs.updateProgress(run.id, { commitsCreated: 999 })).toBe(false);
    expect(await runs.findById(replacement.id)).toMatchObject({ status: 'RUNNING' });
  });

  it('fences a worker paused between progress check and actual persistence', async () => {
    const {
      user,
      items: [p]
    } = await fixture();
    const old = await runs.reserveAutomatic(p.id);
    const entered = gate(),
      release = gate();
    const original = commits.createMany;
    const spy = vi.spyOn(commits, 'createMany').mockImplementationOnce(async (...args) => {
      entered.resolve();
      await release.promise;
      return original(...args);
    });
    const work = execute(old.run.id);
    try {
      await entered.promise;
      const future = new Date(Date.now() + policy.leaseMs + 1000);
      await runs.expireIfStillStale(old.run.id, p.id, new Date(future - policy.leaseMs), future);
      const replacement = await requestSync(p.id, user.id, { schedule: () => {} });
      await execute(replacement.id);
      const snapshot = await integration(p.id);
      release.resolve();
      await work;
      expect(await integration(p.id)).toEqual(snapshot);
      expect((await runs.findById(old.run.id)).errorCode).toBe('GITHUB_SYNC_STALE');
      expect(await prisma.commit.count()).toBe(1);
    } finally {
      release.resolve();
      await work;
      spy.mockRestore();
    }
  });

  it.each([429, 503, 'ETIMEDOUT', 401])(
    'persists bounded retry/auth policy after provider failure %s and preserves history',
    async (failure) => {
      const {
        items: [p]
      } = await fixture();
      const previous = new Date('2026-01-01T00:00:00Z');
      await prisma.projectGitHubIntegration.update({
        where: { projectId: p.id },
        data: { lastSyncAt: previous }
      });
      boundary.client.listIssuePages = async function* () {
        throw Object.assign(
          new Error('private external details'),
          typeof failure === 'number'
            ? { status: failure, response: { headers: { 'retry-after': '7200' } } }
            : { code: failure }
        );
      };
      const w = worker();
      await w.tick();
      await w.drain();
      await w.tick();
      await w.stop();
      const data = await integration(p.id);
      expect(data.lastSyncAt).toEqual(previous);
      expect(data.lastSyncStatus).toBe('FALHA');
      expect(await prisma.commit.count()).toBe(1);
      expect(await prisma.gitHubSyncRun.count()).toBe(1);
      expect(data.status).toBe(failure === 401 ? 'RECONNECT_REQUIRED' : 'ACTIVE');
      if (failure === 401) expect(data.nextSyncAt).toBeNull();
      else expect(data.nextSyncAt.getTime()).toBeGreaterThan(Date.now() + policy.intervalMs);
      if (failure === 429) {
        expect(data.nextSyncAt.getTime()).toBeGreaterThan(Date.now() + 7199000);
        expect(
          (
            await prisma.gitHubInstallation.findUnique({
              where: { id: p.githubIntegration.installationId }
            })
          ).syncNotBefore > new Date()
        ).toBe(true);
      }
    }
  );

  it('rolls back scheduling and slot release if final persistence fails, then recovers through the lease', async () => {
    const {
      items: [p]
    } = await fixture();
    const { run } = await runs.reserveAutomatic(p.id);
    await runs.claim(run.id);
    const before = await integration(p.id);
    await expect(
      runs.succeed(run.id, { commits: { found: 2 ** 50 } }, new Date(), 1)
    ).rejects.toThrow();
    expect(await integration(p.id)).toEqual(before);
    expect(await runs.findById(run.id)).toMatchObject({ status: 'RUNNING', automaticSlot: 1 });
    const future = new Date(Date.now() + policy.leaseMs + 1000);
    const w = worker({ now: () => future });
    await w.tick();
    await w.stop();
    expect(await runs.findById(run.id)).toMatchObject({ status: 'FAILED', automaticSlot: null });
    expect((await integration(p.id)).nextSyncAt > future).toBe(true);
  });
  it('shutdown is idempotent, drains existing work and never launches after stopping', async () => {
    const { items } = await fixture(2);
    const entered = gate(),
      release = gate();
    const executeJob = vi.fn(async () => {
      entered.resolve();
      await release.promise;
    });
    const w = worker({ execute: executeJob });
    expect(w.start()).toBe(true);
    expect(w.start()).toBe(false);
    await entered.promise;
    const stop = w.stop();
    release.resolve();
    await stop;
    await w.stop();
    await w.tick();
    expect(executeJob).toHaveBeenCalledOnce();
    expect((await runs.findActive(items[0].id)).status).toBe('QUEUED');
    expect(w.start()).toBe(false);
    const disabled = worker({ enabled: false });
    expect(disabled.start()).toBe(false);
    await disabled.stop();
  });

  it('soft delete fences the active run; restore receives a new distributed schedule', async () => {
    const {
      user,
      items: [p]
    } = await fixture();
    const { projectDeletionRepository } =
      await import('../../src/modules/projects/project-deletion.repository.js');
    const { run } = await runs.reserveAutomatic(p.id);
    await runs.claim(run.id);
    await projects.markGithubSyncStarted(p.id, new Date());
    const time = new Date();
    const auditData = {
      actorType: 'USER',
      actorUserId: user.id,
      projectId: p.id,
      action: 'PROJECT_DELETED',
      resourceType: 'Project',
      resourceId: String(p.id),
      retentionUntil: new Date(time.getTime() + 86400000),
      result: 'SUCCESS'
    };
    expect(
      (
        await projectDeletionRepository.requestDeletion({
          projectId: p.id,
          userId: user.id,
          now: time,
          scheduledFor: new Date(time.getTime() + 86400000),
          auditData
        })
      ).outcome
    ).toBe('DELETED');
    expect(await runs.findActive(p.id)).toBeNull();
    expect(await integration(p.id)).toMatchObject({ nextSyncAt: null, lastSyncStatus: 'FALHA' });
    expect(
      (
        await projectDeletionRepository.restore({
          projectId: p.id,
          userId: user.id,
          now: time,
          auditData: { ...auditData, action: 'PROJECT_RESTORED' }
        })
      ).outcome
    ).toBe('RESTORED');
    const w = worker();
    await w.tick();
    await w.stop();
    expect((await integration(p.id)).nextSyncAt > new Date()).toBe(true);
    expect(await prisma.gitHubSyncRun.count()).toBe(1);
    expect(boundary.client.getRepository).not.toHaveBeenCalled();
  });

  it('a schedule write failure rolls back terminal status and preserves the active reservation', async () => {
    const {
      items: [p]
    } = await fixture();
    const { run } = await runs.reserveAutomatic(p.id);
    await runs.claim(run.id);
    const before = await integration(p.id);
    const transaction = prisma.$transaction.bind(prisma);
    const fault = vi.spyOn(prisma, '$transaction').mockImplementationOnce((work, options) =>
      transaction(
        (tx) =>
          work(
            new Proxy(tx, {
              get(target, key) {
                if (key !== 'projectGitHubIntegration') return target[key];
                return new Proxy(target[key], {
                  get(model, method) {
                    if (method === 'update')
                      return () => {
                        throw new Error('Injected schedule persistence failure');
                      };
                    return model[method];
                  }
                });
              }
            })
          ),
        options
      )
    );
    await expect(runs.succeed(run.id, {}, new Date(), 1)).rejects.toThrow(
      'Injected schedule persistence failure'
    );
    fault.mockRestore();
    expect(await integration(p.id)).toEqual(before);
    expect(await runs.findById(run.id)).toMatchObject({
      status: 'RUNNING',
      activeProjectId: p.id,
      automaticSlot: 1
    });
  });
});
