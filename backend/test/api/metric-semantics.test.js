import { createHash } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startTestServer } from '../helpers/http-server.js';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

let prisma,
  app,
  serial = 0;
const asOf = new Date('2026-10-05T20:00:00Z');
const syncedAt = new Date('2026-10-05T19:55:00Z');
beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ default: app } = await import('../../src/app.js'));
  app = await startTestServer(app);
  await cleanTestDatabase(prisma);
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(asOf);
});
afterEach(async () => {
  vi.useRealTimers();
  await cleanTestDatabase(prisma);
});
afterAll(async () => {
  if (prisma) {
    await cleanTestDatabase(prisma);
    await prisma.$disconnect();
  }
});

async function fixture(github = false) {
  const n = ++serial;
  const user = await prisma.user.create({
    data: {
      name: `Semantic ${n}`,
      username: `semantic_${n}`,
      email: `semantic_${n}@example.invalid`,
      passwordHash: 'artificial',
      emailVerifiedAt: new Date()
    }
  });
  const token = `semantic-session-${n}`;
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      csrfTokenHash: createHash('sha256').update('artificial').digest('hex'),
      sessionVersion: user.sessionVersion,
      expiresAt: new Date(Date.now() + 86400000)
    }
  });
  const project = await prisma.project.create({
    data: {
      name: `Semantic ${n}`,
      responsibleTeam: 'Fixture',
      accessCode: `SEM-${n}`,
      memberships: { create: { userId: user.id, role: 'OWNER' } },
      ...(github
        ? {
            githubIntegration: {
              create: {
                status: 'ACTIVE',
                lastSyncStatus: 'SINCRONIZADO',
                lastSyncAt: syncedAt,
                pullRequestLifecycleCoverageFrom: new Date('2026-08-01'),
                pullRequestLifecycleSyncedAt: syncedAt
              }
            }
          }
        : {})
    }
  });
  return { project, user, token };
}
const get = (f, endpoint, query = '') =>
  request(app)
    .get(`/api/projects/${f.project.id}/indicators/${endpoint}${query}`)
    .set('Cookie', `traceflow_session=${f.token}`);
const map = (response) =>
  Object.fromEntries(
    (response.body.indicators ?? response.body.sections.flatMap((s) => s.indicators)).map((row) => [
      row.metricId,
      row
    ])
  );

async function lifecycle(f, empty = false) {
  if (empty) return;
  const rows = [];
  for (let i = 0; i < 5; i++) {
    const n = ++serial;
    const pr = await prisma.pullRequest.create({
      data: {
        projectId: f.project.id,
        githubId: `sem-${n}`,
        number: n,
        title: `Fixture PR ${n}`,
        state: 'closed',
        createdAtGithub: new Date('2026-10-01')
      }
    });
    const closed = i === 4 ? new Date('2026-10-05T19:58:00Z') : new Date('2026-10-03T12:00:00Z');
    rows.push({
      projectId: f.project.id,
      pullRequestId: pr.id,
      eventType: 'CLOSED',
      occurredAt: closed,
      providerEventId: `closed-${n}`
    });
    if (i < 2)
      rows.push({
        projectId: f.project.id,
        pullRequestId: pr.id,
        eventType: 'REOPENED',
        occurredAt: new Date(i === 0 ? '2026-10-04T12:00:00Z' : '2026-10-05T19:58:00Z'),
        providerEventId: `reopened-${n}`
      });
  }
  await prisma.pullRequestLifecycleEvent.createMany({ data: rows });
}

describe('PR23-FIX-03 persisted API/runtime semantics', () => {
  it('keeps a project without GitHub local and never fabricates technical values or stale clocks', async () => {
    const f = await fixture();
    const requirement = await prisma.requirement.create({
      data: { projectId: f.project.id, title: 'Local requirement' }
    });
    await prisma.task.create({
      data: {
        projectId: f.project.id,
        title: 'Local task',
        requirementId: requirement.id,
        status: 'CONCLUIDO',
        responsibleUserId: f.user.id,
        estimatedEffort: 2
      }
    });
    await prisma.testCase.create({
      data: {
        projectId: f.project.id,
        title: 'Local case',
        requirementId: requirement.id,
        responsibleUserId: f.user.id,
        preconditions: 'Fixture',
        expectedResult: 'Fixture'
      }
    });
    const trace = await get(f, 'traceability');
    expect(trace.status).toBe(200);
    expect(map(trace).I63).toMatchObject({ value: 100, state: 'AVAILABLE' });
    for (const id of ['I62', 'I65', 'I66'])
      expect(map(trace)[id]).toMatchObject({
        value: null,
        numerator: null,
        state: 'UNAVAILABLE',
        sourceUpdatedAt: null,
        limitations: ['GITHUB_NOT_CONFIGURED']
      });
    const gh = await get(f, 'github', '?startDate=2026-10-01&endDate=2026-10-05&timeZone=UTC');
    expect(gh.status).toBe(200);
    for (const row of gh.body.indicators) {
      expect(row.state).toBe('UNAVAILABLE');
      expect(row.sourceUpdatedAt).toBeNull();
      expect(row.limitations).toContain('GITHUB_NOT_CONFIGURED');
    }
    const general = await get(f, 'dashboard', '?timeZone=America%2FSao_Paulo');
    expect(general.status, JSON.stringify(general.body)).toBe(200);
    expect(map(general).I01).toMatchObject({ state: 'AVAILABLE', value: 100 });
    expect(general.body.projectHealth.assessments.I04).toMatchObject({
      score: null,
      reasonCode: 'GITHUB_NOT_CONFIGURED'
    });
    expect(
      general.body.projectHealth.dimensions.find((row) => row.id === 'TRACEABILITY')
    ).toMatchObject({ coverage: 100, score: 100, assessedSignals: ['I61'] });
    expect(
      general.body.projectHealth.dimensions.find((row) => row.id === 'TECHNICAL_INTEGRATION').status
    ).toBe('NOT_APPLICABLE');
    expect(JSON.stringify(general.body)).not.toContain('STALE');
    expect(general.body.projectHealth.score).not.toBe(0);
    const githubView = await get(f, 'dashboard', '?view=GITHUB');
    expect(githubView.status).toBe(200);
    for (const row of Object.values(map(githubView))) {
      expect(row).toMatchObject({
        value: null,
        state: 'UNAVAILABLE',
        sourceUpdatedAt: null,
        limitations: ['GITHUB_NOT_CONFIGURED']
      });
    }
  });

  it('uses the civil deadline in I28, list, summary and Health across the UTC/local midnight', async () => {
    vi.setSystemTime(new Date('2026-10-06T01:00:00Z')); // Oct 5 locally.
    const f = await fixture();
    await prisma.task.createMany({
      data: ['2026-10-04', '2026-10-05', '2026-10-06'].map((deadline) => ({
        projectId: f.project.id,
        title: deadline,
        deadline: new Date(deadline),
        responsibleUserId: f.user.id,
        estimatedEffort: 2
      }))
    });
    await prisma.task.create({
      data: {
        projectId: f.project.id,
        title: 'Done yesterday',
        deadline: new Date('2026-10-04'),
        status: 'CONCLUIDO'
      }
    });
    const general = await get(f, 'dashboard', '?timeZone=America%2FSao_Paulo');
    expect(general.status).toBe(200);
    expect(map(general).I28).toMatchObject({
      value: 1,
      scope: { timeZone: 'America/Sao_Paulo' },
      assessment: { basis: { count: 1, totalTasks: 4 }, score: 75 }
    });
    expect(map(general).I28.items.map((row) => row.title)).toEqual(['2026-10-04']);
    const tasks = await get(
      f,
      'tasks',
      '?startDate=2026-10-01&endDate=2026-10-05&timeZone=America%2FSao_Paulo'
    );
    expect(map(tasks).I28.value).toBe(1);
    for (const view of ['TASK', 'PLANNING', 'CUSTOM&widgets=I28']) {
      const dashboard = await get(f, 'dashboard', `?view=${view}&timeZone=America%2FSao_Paulo`);
      expect(dashboard.status, JSON.stringify(dashboard.body)).toBe(200);
      expect(map(dashboard).I28).toMatchObject({
        value: 1,
        scope: { timeZone: 'America/Sao_Paulo' },
        assessment: { basis: { count: 1, totalTasks: 4 } }
      });
    }
    const utc = await get(f, 'dashboard', '?timeZone=UTC');
    expect(map(utc).I28.value).toBe(2);
    vi.setSystemTime(new Date('2026-10-06T03:00:00Z'));
    const nextDay = await get(f, 'dashboard', '?timeZone=America%2FSao_Paulo');
    expect(nextDay.status, JSON.stringify(nextDay.body)).toBe(200);
    expect(map(nextDay).I28).toMatchObject({
      value: 2,
      assessment: { basis: { count: 2, totalTasks: 4 } }
    });
  });

  it('evaluates I04 after a sync five minutes ago and excludes all later lifecycle facts', async () => {
    const f = await fixture(true);
    await lifecycle(f);
    const general = await get(f, 'dashboard');
    expect(general.status, JSON.stringify(general.body)).toBe(200);
    expect(general.body.projectHealth.assessments.I04).toMatchObject({
      score: 75,
      status: 'ATTENTION',
      basis: {
        value: 25,
        closedPullRequests: 4,
        reopenedPullRequests: 1,
        cohortEndExclusive: syncedAt.toISOString()
      }
    });
    const github = await get(f, 'github', '?startDate=2026-10-01&endDate=2026-10-05&timeZone=UTC');
    expect(map(github).I04).toMatchObject({
      value: 25,
      state: 'AVAILABLE',
      numerator: 1,
      denominator: 4,
      period: { endExclusive: syncedAt.toISOString() },
      coverage: { through: syncedAt.toISOString() }
    });
    expect(map(github).I11.value).toBe(4);
    expect(map(github).I04.limitations).toContain('PR_COHORT_CUT_AT_LAST_SYNC');
  });

  it('keeps the known cohort value stale after a failed sync, without forcing a Health score', async () => {
    const f = await fixture(true);
    await lifecycle(f);
    await prisma.projectGitHubIntegration.update({
      where: { projectId: f.project.id },
      data: {
        lastSyncAt: new Date('2026-10-04T18:00:00Z'),
        lastSyncStatus: 'FALHA',
        pullRequestLifecycleSyncedAt: new Date('2026-10-04T18:00:00Z')
      }
    });
    const github = await get(f, 'github', '?startDate=2026-10-01&endDate=2026-10-05&timeZone=UTC');
    expect(map(github).I04).toMatchObject({ value: 25, state: 'STALE', sourceSyncStatus: 'FALHA' });
    const general = await get(f, 'dashboard');
    expect(general.body.projectHealth.assessments.I04).toMatchObject({
      score: null,
      status: 'UNASSESSED',
      reasonCode: 'DATA_STALE'
    });
  });

  it('keeps incomplete initial coverage partial and zero-denominator cohorts NO_DATA', async () => {
    const f = await fixture(true);
    const empty = await get(f, 'github', '?startDate=2026-10-01&endDate=2026-10-05&timeZone=UTC');
    expect(map(empty).I04).toMatchObject({ value: null, denominator: 0, state: 'NO_DATA' });
    await lifecycle(f);
    await prisma.projectGitHubIntegration.update({
      where: { projectId: f.project.id },
      data: { pullRequestLifecycleCoverageFrom: new Date('2026-10-02') }
    });
    const partial = await get(f, 'github', '?startDate=2026-10-01&endDate=2026-10-05&timeZone=UTC');
    expect(map(partial).I04).toMatchObject({
      value: null,
      state: 'PARTIAL',
      period: { startInclusive: '2026-10-02T00:00:00.000Z' }
    });
    expect(map(partial).I04.limitations).toContain('PR_LIFECYCLE_PERIOD_NOT_COVERED');
    const general = await get(f, 'dashboard');
    expect(general.body.projectHealth.assessments.I04.score).toBeNull();
  });

  it('validates timezone even without an event period and still requires paired dates', async () => {
    const f = await fixture();
    expect((await get(f, 'dashboard', '?timeZone=NotAZone')).status).toBe(400);
    expect((await get(f, 'dashboard', '?startDate=2026-10-01&timeZone=UTC')).status).toBe(400);
    expect((await get(f, 'dashboard', '?timeZone=America%2FNew_York')).status).toBe(200);
  });
});
