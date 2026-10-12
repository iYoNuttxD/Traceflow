import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { startTestServer } from '../helpers/http-server.js';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

let prisma, runs, app;
beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ githubSyncRunRepository: runs } =
    await import('../../src/modules/github/github-sync-run.repository.js'));
  const { default: application } = await import('../../src/app.js');
  app = await startTestServer(application);
});
beforeEach(async () => cleanTestDatabase(prisma));
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function fixture() {
  const otherAgent = request.agent(app);
  const other = await otherAgent.post('/api/auth/register').send({
    name: 'Other owner',
    username: 'otherlock',
    email: 'otherlock@example.invalid',
    password: 'SenhaSegura123'
  });
  expect(other.status).toBe(201);
  expect(
    (
      await request(app)
        .post('/api/auth/email-verification/verify')
        .send({ token: other.body.emailVerification.testToken })
    ).status
  ).toBe(200);
  const agent = request.agent(app);
  const registration = await agent.post('/api/auth/register').send({
    name: 'Lock fixture',
    username: 'lockfixture',
    email: 'lock@example.invalid',
    password: 'SenhaSegura123'
  });
  expect(registration.status).toBe(201);
  const verification = await request(app)
    .post('/api/auth/email-verification/verify')
    .send({ token: registration.body.emailVerification.testToken });
  expect(verification.status).toBe(200);
  const owner = registration.body.user;
  const installation = await prisma.gitHubInstallation.create({
    data: {
      githubInstallationId: '1',
      accountId: '1',
      accountLogin: 'fixture',
      accountType: 'User',
      status: 'ACTIVE',
      installedAt: new Date()
    }
  });
  const projects = [];
  for (let i = 0; i < 2; i++)
    projects.push(
      await prisma.project.create({
        data: {
          name: `Lock project ${i}`,
          responsibleTeam: 'Team',
          accessCode: `LOCK-${i}`,
          memberships: {
            create: { userId: i === 0 ? owner.id : other.body.user.id, role: 'OWNER' }
          },
          githubIntegration: {
            create: {
              installationId: installation.id,
              githubRepositoryId: String(i + 1),
              repositoryName: `repo-${i}`,
              repositoryFullName: `fixture/repo-${i}`,
              status: 'ACTIVE',
              autoSyncEnabled: true,
              nextSyncAt: new Date()
            }
          }
        }
      })
    );
  return { agent: otherAgent, owner, projects, csrf: other.body.csrfToken };
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('GitHub coordination under a real Project lock longer than Prisma default timeout', () => {
  it.each(['heartbeat', 'claim', 'reserveAutomatic', 'recovery', 'manual', 'terminal', 'artifact'])(
    '%s returns promptly while another authenticated project remains operational',
    async (operation) => {
      const {
        agent,
        owner,
        projects: [x, y],
        csrf
      } = await fixture();
      const stale = new Date(Date.now() - 3600000);
      let run;
      if (!['reserveAutomatic', 'manual'].includes(operation)) {
        run = await runs.create(x.id, owner.id);
        if (operation !== 'claim') expect(await runs.claim(run.id)).toBe(true);
        if (operation === 'recovery')
          await prisma.gitHubSyncRun.update({
            where: { id: run.id },
            data: { heartbeatAt: stale }
          });
      }
      let locked, release;
      const acquired = new Promise((resolve) => {
        locked = resolve;
      });
      const released = new Promise((resolve) => {
        release = resolve;
      });
      // Only the fixture has a longer timeout, to reproduce a competing 6.5s writer.
      const holder = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM Project WHERE id = ${x.id} FOR UPDATE`;
          locked();
          await released;
        },
        { timeout: 10000 }
      );
      await acquired;
      let result, elapsed, failure;
      const started = Date.now();
      const pending = (async () => {
        try {
          if (operation === 'heartbeat')
            result = await runs.updateProgress(run.id, { commitPages: 7 });
          if (operation === 'claim') result = await runs.claim(run.id);
          if (operation === 'reserveAutomatic') result = await runs.reserveAutomatic(x.id);
          if (operation === 'recovery')
            result = await runs.expireIfStillStale(run.id, x.id, new Date(Date.now() - 1800000));
          if (operation === 'manual') {
            const { requestProjectGithubSync } =
              await import('../../src/modules/github/services/github-sync-run.service.js');
            result = await requestProjectGithubSync(x.id, owner.id, {
              schedule: () => {
                throw new Error('Busy project must not schedule');
              }
            });
          }
          if (operation === 'terminal') result = await runs.succeed(run.id, {}, new Date(), 1);
          if (operation === 'artifact') {
            const { withProjectWriteGuard } =
              await import('../../src/modules/projects/project-write-context.js');
            const { commitRepository } =
              await import('../../src/modules/commits/commit.repository.js');
            result = await withProjectWriteGuard(
              x.id,
              (tx) => runs.assertLease(tx, run.id, x.id),
              () =>
                commitRepository.createMany([
                  { projectId: x.id, hash: 'contended', message: 'Must not be written' }
                ]),
              { nowait: true }
            );
          }
        } catch (error) {
          failure = error.code;
        }
        elapsed = Date.now() - started;
      })();
      let session, detail, edit;
      try {
        await pause(5500);
        session = await agent.get('/api/auth/me');
        detail = await agent.get(`/api/projects/${y.id}`);
        edit = await agent
          .put(`/api/projects/${y.id}`)
          .set('X-CSRF-Token', csrf)
          .send({ name: 'Still operational' });
        await pause(Math.max(0, 6500 - (Date.now() - started)));
      } finally {
        release();
        await holder;
        await pending;
      }
      expect({
        operation,
        elapsed,
        failure,
        http: [session.status, detail.status, edit.status]
      }).toMatchObject({
        failure: ['manual', 'terminal'].includes(operation)
          ? 'GITHUB_SYNC_BUSY'
          : operation === 'artifact'
            ? 'PROJECT_WRITE_BUSY'
            : undefined,
        http: [200, 200, 200]
      });
      expect(elapsed).toBeLessThan(2000);
      if (operation === 'heartbeat') {
        expect(result).toBeNull(); // deferred, distinct from a lost lease
        expect((await runs.findById(run.id)).commitPages).toBe(0);
        expect(await runs.updateProgress(run.id, { commitPages: 7 })).toBe(true);
      }
      if (operation === 'claim') {
        expect(result).toBe(false);
        expect((await runs.findById(run.id)).status).toBe('QUEUED');
        expect(await runs.claim(run.id)).toBe(true);
        expect(await runs.claim(run.id)).toBe(false);
      }
      if (operation === 'reserveAutomatic') {
        expect(result).toMatchObject({ outcome: 'CONTENDED' });
        expect(await runs.findActive(x.id)).toBeNull();
        const reservations = await Promise.all([
          runs.reserveAutomatic(x.id),
          runs.reserveAutomatic(x.id)
        ]);
        expect(reservations.filter((r) => r.outcome === 'RESERVED')).toHaveLength(1);
      }
      if (operation === 'recovery') {
        expect(result).toEqual({ count: 0 });
        expect((await runs.findById(run.id)).status).toBe('RUNNING');
        expect(await runs.expireIfStillStale(run.id, x.id, new Date(Date.now() - 1800000))).toEqual(
          { count: 1 }
        );
        expect(await runs.updateProgress(run.id, {})).toBe(false);
      }
      if (operation === 'manual') expect(await runs.findActive(x.id)).toBeNull();
      if (operation === 'terminal') {
        expect((await runs.findById(run.id)).status).toBe('RUNNING');
        expect(await runs.succeed(run.id, {}, new Date(), 1)).toMatchObject({
          status: 'SUCCEEDED'
        });
      }
      if (operation === 'artifact')
        expect(await prisma.commit.count({ where: { projectId: x.id } })).toBe(0);
    }
  );
});
