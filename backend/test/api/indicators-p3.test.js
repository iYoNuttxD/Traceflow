import { createHash } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startTestServer } from '../helpers/http-server.js';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

let prisma;
let app;
let serial = 0;
const query = '?startDate=2026-09-01&endDate=2026-09-30&timeZone=UTC';
const path = (id) => `/api/projects/${id}/indicators/github${query}`;
const at = (day, hour = 0) =>
  new Date(`2026-09-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00Z`);

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ default: app } = await import('../../src/app.js'));
  app = await startTestServer(app);
  await cleanTestDatabase(prisma);
});
afterEach(async () => cleanTestDatabase(prisma));
afterAll(async () => {
  if (prisma) {
    await cleanTestDatabase(prisma);
    await prisma.$disconnect();
  }
});

async function actor(role = 'OWNER', projectId = null) {
  const n = ++serial;
  const person = await prisma.user.create({
    data: {
      name: `P3 ${n}`,
      username: `p3_${n}`,
      email: `p3_${n}@example.invalid`,
      passwordHash: 'artificial',
      emailVerifiedAt: new Date()
    }
  });
  const token = `p3-session-${n}`;
  await prisma.session.create({
    data: {
      userId: person.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      csrfTokenHash: createHash('sha256').update('artificial').digest('hex'),
      sessionVersion: person.sessionVersion,
      expiresAt: new Date(Date.now() + 600000)
    }
  });
  if (projectId) {
    await prisma.projectMembership.create({ data: { projectId, userId: person.id, role } });
  }
  return { ...person, token };
}

async function project(owner, { coverage = true, synced = true } = {}) {
  const n = ++serial;
  return prisma.project.create({
    data: {
      name: `P3 ${n}`,
      responsibleTeam: 'Equipe artificial',
      accessCode: `P3-${n}`,
      memberships: { create: { userId: owner.id, role: 'OWNER' } },
      githubIntegration: {
        create: {
          status: 'ACTIVE',
          ...(synced ? { lastSyncAt: at(30, 23), lastSyncStatus: 'SINCRONIZADO' } : {}),
          ...(coverage
            ? {
                pullRequestLifecycleCoverageFrom: at(1),
                pullRequestLifecycleSyncedAt: new Date('2026-10-01T00:00:00Z')
              }
            : {})
        }
      }
    }
  });
}

function get(id, person) {
  const call = request(app).get(path(id));
  return person ? call.set('Cookie', `traceflow_session=${person.token}`) : call;
}

async function pr(projectId, { created = at(1), merged = null, state = 'closed' } = {}) {
  const n = ++serial;
  return prisma.pullRequest.create({
    data: {
      projectId,
      githubId: `p3-pr-${n}`,
      number: n,
      title: `PR ${n}`,
      githubUrl: `https://example.invalid/pull/${n}`,
      createdAtGithub: created,
      mergedAtGithub: merged,
      state
    }
  });
}

async function event(projectId, pullRequestId, eventType, occurredAt) {
  return prisma.pullRequestLifecycleEvent.create({
    data: {
      projectId,
      pullRequestId,
      eventType,
      occurredAt,
      providerEventId: `p3-event-${++serial}`
    }
  });
}

function indicators(response) {
  return Object.fromEntries(response.body.indicators.map((item) => [item.metricId, item]));
}

describe('GitHub analytics P3 — API', () => {
  it('RF18 usa coorte CLOSED distinta, reabertura posterior dentro do corte e merge sem duplicar', async () => {
    const owner = await actor();
    const p = await project(owner);
    const a = await pr(p.id, { merged: at(10) });
    await event(p.id, a.id, 'CLOSED', at(1));
    await event(p.id, a.id, 'REOPENED', at(5));
    await event(p.id, a.id, 'CLOSED', at(10));
    await event(p.id, a.id, 'MERGED', at(10));
    await event(p.id, a.id, 'REOPENED', at(15));
    const b = await pr(p.id);
    await event(p.id, b.id, 'CLOSED', at(30, 23));
    await event(p.id, b.id, 'REOPENED', new Date('2026-10-02T00:00:00Z'));
    const c = await pr(p.id);
    await event(p.id, c.id, 'CLOSED', at(20));
    const beforePeriod = await pr(p.id);
    await event(p.id, beforePeriod.id, 'CLOSED', new Date('2026-08-20T00:00:00Z'));
    await event(p.id, beforePeriod.id, 'REOPENED', at(5));
    const afterPeriod = await pr(p.id);
    await event(p.id, afterPeriod.id, 'CLOSED', new Date('2026-10-01T00:00:00Z'));
    const out = await get(p.id, owner);
    expect(out.status).toBe(200);
    const i = indicators(out);
    expect(i.I04).toMatchObject({ value: 33.33, numerator: 1, denominator: 3, state: 'AVAILABLE' });
    expect(i.I04).toMatchObject({
      projectId: p.id,
      metricId: 'I04',
      definitionVersion: 1,
      sourceSyncStatus: 'SINCRONIZADO',
      period: {
        startInclusive: at(1).toISOString(),
        endExclusive: '2026-10-01T00:00:00.000Z'
      },
      coverage: { from: at(1).toISOString(), through: '2026-10-01T00:00:00.000Z' },
      limitations: []
    });
    expect(i.I04.formula).toContain('CLOSED');
    expect(i.I04.sources).toContain('PullRequestLifecycleEvent');
    expect(i.I04.asOf).toBeTruthy();
    expect(i.I06).toMatchObject({
      value: { reworkRate: 33.33, mergedRate: 33.33 },
      numerator: 1,
      denominator: 3,
      components: { rework: 'AVAILABLE', merged: 'AVAILABLE' }
    });
    expect(i.I11).toMatchObject({ value: 3, state: 'AVAILABLE' });
    expect(i.I12).toMatchObject({ value: 1, state: 'AVAILABLE' });
    expect(JSON.stringify(out.body)).not.toContain('providerEventId');
  });

  it('mantém 0/denominador e 0/0 semanticamente distintos', async () => {
    const owner = await actor();
    const p = await project(owner);
    const empty = indicators(await get(p.id, owner));
    expect(empty.I04).toMatchObject({ value: null, denominator: 0, state: 'NO_DATA' });
    const onlyClosed = await pr(p.id);
    await event(p.id, onlyClosed.id, 'CLOSED', at(1));
    const one = indicators(await get(p.id, owner));
    expect(one.I04).toMatchObject({ value: 0, numerator: 0, denominator: 1, state: 'AVAILABLE' });
    expect(one.I06.value.mergedRate).toBe(0);
  });

  it('não calcula taxa de lifecycle sem cobertura comprovada, inclusive legado com eventos', async () => {
    const owner = await actor();
    const p = await project(owner, { coverage: false });
    const item = await pr(p.id, { merged: at(10) });
    await event(p.id, item.id, 'CLOSED', at(2));
    const i = indicators(await get(p.id, owner));
    expect(i.I04).toMatchObject({ value: null, state: 'UNAVAILABLE' });
    expect(i.I04.limitations).toContain('PR_LIFECYCLE_PERIOD_NOT_COVERED');
    expect(i.I11.value).toBeNull();
    expect(i.I12).toMatchObject({ value: 1, state: 'AVAILABLE' });
    await prisma.projectGitHubIntegration.update({
      where: { projectId: p.id },
      data: {
        pullRequestLifecycleCoverageFrom: at(15),
        pullRequestLifecycleSyncedAt: new Date('2026-10-01T00:00:00Z')
      }
    });
    expect(indicators(await get(p.id, owner)).I04.state).toBe('PARTIAL');
  });

  it('conta commits de qualquer branch, estado atual, durações e exclusões', async () => {
    const owner = await actor();
    const p = await project(owner);
    await prisma.commit.create({ data: { projectId: p.id, hash: 'start', date: at(1) } });
    await prisma.commit.create({ data: { projectId: p.id, hash: 'middle', date: at(15) } });
    await prisma.commit.create({
      data: { projectId: p.id, hash: 'end', date: new Date('2026-10-01T00:00:00Z') }
    });
    await pr(p.id, { created: at(1), merged: at(1, 1) });
    await pr(p.id, { created: at(1), merged: at(1, 3) });
    await pr(p.id, { created: at(1), merged: at(1, 8) });
    await pr(p.id, { created: null, merged: at(2) });
    await pr(p.id, { created: at(5), merged: at(4) });
    await pr(p.id, { state: 'open' });
    await prisma.issue.create({
      data: {
        projectId: p.id,
        githubId: 'issue-1',
        number: 1,
        title: 'Issue',
        state: 'closed',
        createdAtGithub: at(1),
        closedAtGithub: at(4)
      }
    });
    await prisma.issue.create({
      data: {
        projectId: p.id,
        githubId: 'issue-2',
        number: 2,
        title: 'Issue',
        state: 'open'
      }
    });
    const out = await get(p.id, owner);
    expect(out.status).toBe(200);
    const i = indicators(out);
    expect(i.I09).toMatchObject({ value: 2, state: 'AVAILABLE' });
    expect(i.I10).toMatchObject({ value: 1, period: null });
    expect(i.I12.value).toBe(5);
    expect(i.I13).toMatchObject({ value: 1, period: null });
    expect(i.I14).toMatchObject({ value: 1, state: 'PARTIAL' });
    expect(i.I14.limitations).toContain('ISSUE_LIFECYCLE_NOT_COLLECTED');
    expect(i.I15).toMatchObject({ value: 3, eligibleCount: 3, excludedCount: 2, state: 'PARTIAL' });
    expect(i.I16.value).toBe(4);
    expect(i.I18).toMatchObject({ value: 3, eligibleCount: 1, excludedCount: 0 });
    expect(i.I74.value).toBe(3);
    expect(i.I17).toMatchObject({ kind: 'LIST', eligibleCount: 1, period: null });
    expect(i.I17.items).toHaveLength(1);
    expect(i.I73.value).toBeGreaterThan(0);
  });

  it('sync falho preserva valor conhecido com STALE; nunca sincronizado fica UNAVAILABLE', async () => {
    const owner = await actor();
    const p = await project(owner);
    await prisma.projectGitHubIntegration.update({
      where: { projectId: p.id },
      data: { lastSyncStatus: 'FALHA' }
    });
    const stale = indicators(await get(p.id, owner));
    expect(stale.I10).toMatchObject({ value: 0, state: 'STALE', sourceSyncStatus: 'FALHA' });
    expect(stale.I10.limitations).toContain('GITHUB_SYNC_FAILED');
    const never = await project(owner, { coverage: false, synced: false });
    expect(indicators(await get(never.id, owner)).I10).toMatchObject({
      value: null,
      state: 'UNAVAILABLE'
    });
  });

  it('limita a lista das PRs antigas sem limitar a média da fila e isola outro projeto', async () => {
    const owner = await actor();
    const p = await project(owner);
    const other = await project(owner);
    for (let day = 1; day <= 11; day++) {
      await pr(p.id, { state: 'open', created: at(day) });
    }
    await pr(other.id, { state: 'open', created: at(1) });
    const i = indicators(await get(p.id, owner));
    expect(i.I10.value).toBe(11);
    expect(i.I17).toMatchObject({ value: 11, eligibleCount: 11, excludedCount: 0 });
    expect(i.I17.items).toHaveLength(10);
    expect(i.I17.items[0].createdAtGithub).toBe(at(1).toISOString());
    expect(i.I17.items[9].createdAtGithub).toBe(at(10).toISOString());
    expect(i.I73.eligibleCount).toBe(11);
  });

  it('aplica VIEWER+ e isolamento do projeto, com validação de período', async () => {
    const owner = await actor();
    const p = await project(owner);
    expect((await get(p.id)).status).toBe(401);
    for (const role of ['VIEWER', 'MEMBER', 'MANAGER']) {
      const member = await actor(role, p.id);
      expect((await get(p.id, member)).status).toBe(200);
    }
    expect((await get(p.id, owner)).status).toBe(200);
    expect((await get(p.id, await actor())).status).toBe(404);
    expect(
      (
        await request(app)
          .get(`/api/projects/${p.id}/indicators/github?startDate=bad`)
          .set('Cookie', `traceflow_session=${owner.token}`)
      ).status
    ).toBe(400);
    await prisma.project.update({ where: { id: p.id }, data: { deletedAt: new Date() } });
    expect((await get(p.id, owner)).status).toBe(404);
  });
});
