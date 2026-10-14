import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { startTestServer } from '../helpers/http-server.js';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { calculateFlowTaskHistory } from '../../src/modules/indicators/calculators/flow-task.calculator.js';

let prisma,
  app,
  flowTaskRepository,
  qualityAnalyticsRepository,
  requirementProjectionRepository,
  githubAnalyticsRepository,
  serial = 0;
beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  // Application repositories create Prisma: import only after configuring the test target.
  ({ flowTaskRepository } = await import('../../src/modules/indicators/flow-task.repository.js'));
  ({ qualityAnalyticsRepository } =
    await import('../../src/modules/indicators/quality-analytics.repository.js'));
  ({ requirementProjectionRepository } =
    await import('../../src/modules/traceability/requirement-projection.repository.js'));
  ({ githubAnalyticsRepository } =
    await import('../../src/modules/indicators/github-analytics.repository.js'));
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ default: app } = await import('../../src/app.js'));
  app = await startTestServer(app);
  await cleanTestDatabase(prisma);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await cleanTestDatabase(prisma);
});
afterAll(async () => {
  if (prisma) {
    await cleanTestDatabase(prisma);
    await prisma.$disconnect();
  }
});

async function fixture() {
  const n = ++serial;
  const user = await prisma.user.create({
    data: {
      name: 'Isolation fixture',
      username: `isolation_${n}`,
      email: `isolation-${n}@example.invalid`,
      emailVerifiedAt: new Date()
    }
  });
  const token = `artificial-isolation-session-${n}`;
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      csrfTokenHash: createHash('sha256').update('fixture').digest('hex'),
      sessionVersion: 1,
      expiresAt: new Date(Date.now() + 600000)
    }
  });
  const project = await prisma.project.create({
    data: {
      name: 'Isolation fixture',
      responsibleTeam: 'Test',
      accessCode: `ISOLATION-${n}`,
      memberships: { create: { userId: user.id, role: 'OWNER' } },
      githubIntegration: {
        create: {
          status: 'ACTIVE',
          lastSyncAt: new Date(),
          lastSyncStatus: 'SINCRONIZADO',
          pullRequestLifecycleCoverageFrom: new Date('2026-08-01'),
          pullRequestLifecycleSyncedAt: new Date()
        }
      }
    }
  });
  const requirement = await prisma.requirement.create({
    data: { projectId: project.id, title: 'Requirement' }
  });
  for (const day of [10, 11, 12]) {
    const task = await prisma.task.create({
      data: {
        projectId: project.id,
        requirementId: requirement.id,
        title: `Task ${day}`,
        status: 'CONCLUIDO',
        estimatedEffort: 4,
        actualEffort: 4,
        responsibleUserId: user.id,
        createdAt: new Date(`2026-09-${day}T12:00:00Z`)
      }
    });
    await prisma.taskMovement.createMany({
      data: [
        {
          projectId: project.id,
          taskId: task.id,
          fromStatus: 'A_FAZER',
          toStatus: 'EM_ANDAMENTO',
          movedAt: new Date(`2026-09-${day}T12:00:00Z`),
          movedBy: 'Fixture'
        },
        {
          projectId: project.id,
          taskId: task.id,
          fromStatus: 'EM_ANDAMENTO',
          toStatus: 'CONCLUIDO',
          movedAt: new Date(`2026-09-${day + 1}T12:00:00Z`),
          movedBy: 'Fixture'
        }
      ]
    });
  }
  return { project, token };
}
const query = 'startDate=2026-09-01&endDate=2026-09-30&timeZone=UTC';
const widgets = 'I01,I21,I28,I09';
const get = (f, view, extra = '') =>
  request(app)
    .get(
      `/api/projects/${f.project.id}/indicators/dashboard?view=${view}&${query}&includeProjectHealth=true${view === 'CUSTOM' ? `&widgets=${widgets}` : ''}${extra}`
    )
    .set('Cookie', `traceflow_session=${f.token}`);
const map = (response) =>
  Object.fromEntries(
    response.body.sections.flatMap((s) => s.indicators).map((row) => [row.metricId, row])
  );
const transient = (code) =>
  new Prisma.PrismaClientKnownRequestError(
    code === 'P2028'
      ? 'A query cannot be executed on an expired transaction.'
      : 'Transient infrastructure failure',
    { code, clientVersion: '6.12.0' }
  );

function countCohortOperations(pattern = 'SELECT COUNT(*) AS closedCount') {
  let count = 0;
  const original = prisma.$transaction.bind(prisma);
  vi.spyOn(prisma, '$transaction').mockImplementation((callback, options) =>
    original(
      (tx) =>
        callback(
          new Proxy(tx, {
            get(target, key) {
              if (key === '$queryRaw')
                return (...args) => {
                  if (args[0].join(' ').includes(pattern)) count++;
                  return target.$queryRaw(...args);
                };
              const value = target[key];
              return typeof value === 'function' ? value.bind(target) : value;
            }
          })
        ),
      options
    )
  );
  return () => count;
}

describe('real HTTP aggregate isolation and selective reads', () => {
  it.each(['GENERAL', 'TASK', 'FLOW', 'CUSTOM'])(
    '%s preserves successful independent facts',
    async (view) => {
      const f = await fixture();
      const reads = vi.spyOn(flowTaskRepository, 'read');
      const response = await get(f, view);
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body.projectHealth).toMatchObject({ healthModelVersion: 1 });
      expect(reads.mock.calls.filter(([, , , options]) => options.historyOnly)).toHaveLength(1);
      expect(reads.mock.calls.filter(([, , , options]) => options.currentSummaryOnly)).toHaveLength(
        1
      );
    }
  );
  it.each(['GENERAL', 'TASK', 'FLOW', 'CUSTOM'])(
    '%s isolates a Prisma history failure, without retry or zero score',
    async (view) => {
      const f = await fixture();
      const before = await get(f, view);
      const original = flowTaskRepository.read.bind(flowTaskRepository);
      const reads = vi
        .spyOn(flowTaskRepository, 'read')
        .mockImplementation((id, period, asOf, options) =>
          options.historyOnly
            ? Promise.reject(transient('P2024'))
            : original(id, period, asOf, options)
        );
      const response = await get(f, view);
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(reads.mock.calls.filter(([, , , options]) => options.historyOnly)).toHaveLength(1);
      expect(response.body.warnings).toContainEqual({
        code: 'SOURCE_UNAVAILABLE',
        source: 'taskHistory'
      });
      const health = response.body.projectHealth;
      const flow = health.dimensions.find((d) => d.id === 'FLOW');
      expect(flow).toMatchObject({ coverage: 0, score: null, status: 'UNASSESSED' });
      expect(health.coverage).toBeLessThanOrEqual(before.body.projectHealth.coverage);
      for (const row of Object.values(map(response))) {
        if (['I20', 'I21', 'I22', 'I24', 'I25'].includes(row.metricId))
          expect(row).toMatchObject({
            state: 'UNAVAILABLE',
            value: null,
            limitations: expect.arrayContaining(['SOURCE_UNAVAILABLE'])
          });
        else expect(row.state).not.toBe('UNAVAILABLE');
      }
    }
  );
  it.each(['GENERAL', 'TASK', 'FLOW', 'CUSTOM'])(
    '%s propagates a functional TypeError',
    async (view) => {
      const f = await fixture();
      const original = flowTaskRepository.read.bind(flowTaskRepository);
      vi.spyOn(flowTaskRepository, 'read').mockImplementation((id, period, asOf, options) =>
        options.historyOnly
          ? Promise.resolve({ tasks: [null], movements: [] })
          : original(id, period, asOf, options)
      );
      expect((await get(f, view)).status).toBe(500);
    }
  );
  it.each(['P2028', 'P2034'])('isolates %s in Health too', async (code) => {
    const f = await fixture();
    const original = flowTaskRepository.read.bind(flowTaskRepository);
    vi.spyOn(flowTaskRepository, 'read').mockImplementation((id, period, asOf, options) =>
      options.historyOnly ? Promise.reject(transient(code)) : original(id, period, asOf, options)
    );
    expect((await get(f, 'GENERAL')).status).toBe(200);
  });
  it('keeps simple TASK reads independent of history, with no period work', async () => {
    const f = await fixture();
    const reads = vi.spyOn(flowTaskRepository, 'read');
    const movements = vi.spyOn(prisma.taskMovement, 'findMany');
    const tasks = vi.spyOn(prisma.task, 'findMany');
    const response = await request(app)
      .get(`/api/projects/${f.project.id}/indicators/dashboard?view=TASK`)
      .set('Cookie', `traceflow_session=${f.token}`);
    expect(response.status).toBe(200);
    expect(reads).toHaveBeenCalledOnce();
    expect(reads.mock.calls[0][3]).toMatchObject({ currentSummaryOnly: true });
    expect(movements).not.toHaveBeenCalled();
    expect(tasks).not.toHaveBeenCalled();
  });
  it('reuses the Requirement projection in QUALITY plus Health', async () => {
    const f = await fixture();
    const reads = vi.spyOn(requirementProjectionRepository, 'readIndicatorSummary');
    expect((await get(f, 'QUALITY')).status).toBe(200);
    expect(reads).toHaveBeenCalledOnce();
  });
  it('does not load fallback-period executions and reuses current Case Health without a period', async () => {
    const f = await fixture();
    const reads = vi.spyOn(qualityAnalyticsRepository, 'read');
    const caseHealthOperations = countCohortOperations('FROM TestCase c LEFT JOIN');
    const response = await request(app)
      .get(
        `/api/projects/${f.project.id}/indicators/dashboard?view=QUALITY&includeProjectHealth=true`
      )
      .set('Cookie', `traceflow_session=${f.token}`);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(reads).toHaveBeenCalledTimes(2);
    expect(reads.mock.calls[0][2].requestedIds).not.toEqual(expect.arrayContaining(['I49', 'I58']));
    expect(reads.mock.calls[1][2].sharedCaseHealth).toEqual([]);
    expect(caseHealthOperations()).toBe(1);
    expect(map(response).I49.limitations).toContain('PERIOD_REQUIRED');
  });
  it('reuses current Case Health when the Health window clips the requested period', async () => {
    const f = await fixture();
    const caseHealthOperations = countCohortOperations('FROM TestCase c LEFT JOIN');
    const endDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const response = await request(app)
      .get(
        `/api/projects/${f.project.id}/indicators/dashboard?view=QUALITY&includeProjectHealth=true&startDate=2026-09-01&endDate=${endDate}&timeZone=UTC`
      )
      .set('Cookie', `traceflow_session=${f.token}`);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(caseHealthOperations()).toBe(1);
  });
  it('retains the current Case Health assessment if only the later temporal read fails', async () => {
    const f = await fixture();
    const original = qualityAnalyticsRepository.read.bind(qualityAnalyticsRepository);
    vi.spyOn(qualityAnalyticsRepository, 'read').mockImplementation((id, period, options) =>
      options.sharedCaseHealth !== undefined
        ? Promise.reject(transient('P2024'))
        : original(id, period, options)
    );
    const response = await request(app)
      .get(
        `/api/projects/${f.project.id}/indicators/dashboard?view=QUALITY&includeProjectHealth=true`
      )
      .set('Cookie', `traceflow_session=${f.token}`);
    expect(response.status).toBe(200);
    expect(map(response).I52.state).toBe('NO_DATA');
    expect(response.body.projectHealth.assessments.I52.reasonCode).toBe('DATA_NO_DATA');
    expect(response.body.warnings).toContainEqual({
      code: 'SOURCE_UNAVAILABLE',
      source: 'quality'
    });
  });
  it('reuses current Case Health even when the requested period is wholly in the future', async () => {
    const f = await fixture();
    const caseHealthOperations = countCohortOperations('FROM TestCase c LEFT JOIN');
    const startDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const endDate = new Date(Date.now() + 172800000).toISOString().slice(0, 10);
    const response = await request(app)
      .get(
        `/api/projects/${f.project.id}/indicators/dashboard?view=QUALITY&includeProjectHealth=true&startDate=${startDate}&endDate=${endDate}&timeZone=UTC`
      )
      .set('Cookie', `traceflow_session=${f.token}`);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(caseHealthOperations()).toBe(1);
    expect(response.body.projectHealth.window).toBeNull();
  });
  it('shares the same closed PR cohort in QUALITY and Health', async () => {
    const f = await fixture();
    const cohortOperations = countCohortOperations();
    const response = await get(f, 'QUALITY');
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(cohortOperations()).toBe(1);
  });
  it('does not reuse a PR cohort with different Health bounds', async () => {
    const f = await fixture();
    const cohortOperations = countCohortOperations();
    const endDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const response = await request(app)
      .get(
        `/api/projects/${f.project.id}/indicators/dashboard?view=QUALITY&includeProjectHealth=true&startDate=2026-09-01&endDate=${endDate}&timeZone=UTC`
      )
      .set('Cookie', `traceflow_session=${f.token}`);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(cohortOperations()).toBe(2);
  });
  it('shares a rejected GitHub snapshot with Health without retrying', async () => {
    const f = await fixture();
    const reads = vi.spyOn(githubAnalyticsRepository, 'read').mockRejectedValue(transient('P2024'));
    const response = await get(f, 'QUALITY');
    expect(response.status).toBe(200);
    expect(reads).toHaveBeenCalledOnce();
    expect(map(response).I06.state).toBe('UNAVAILABLE');
    expect(map(response).I49.state).toBe('NO_DATA');
    expect(response.body.warnings.filter((w) => w.source === 'github')).toHaveLength(1);
  });
  it('Requirement failure leaves independent quality execution facts available', async () => {
    const f = await fixture();
    vi.spyOn(requirementProjectionRepository, 'readIndicatorSummary').mockRejectedValue(
      transient('P2024')
    );
    const response = await get(f, 'QUALITY');
    expect(response.status).toBe(200);
    expect(map(response).I59.state).toBe('UNAVAILABLE');
    expect(map(response).I49.state).toBe('NO_DATA');
    expect(map(response).I53.state).toBe('AVAILABLE');
  });
  it('a failed quality read is shared by the view and Health', async () => {
    const f = await fixture();
    const reads = vi
      .spyOn(qualityAnalyticsRepository, 'read')
      .mockRejectedValue(transient('P2024'));
    const response = await get(f, 'QUALITY');
    expect(response.status).toBe(200);
    expect(reads).toHaveBeenCalledOnce();
    expect(response.body.projectHealth.assessments.I49).toMatchObject({
      status: 'UNASSESSED',
      score: null
    });
  });
  it('Health-only retains the same model, with no widget output', async () => {
    const f = await fixture();
    const general = await get(f, 'GENERAL');
    const summary = await get(f, 'GENERAL', '&healthOnly=true');
    expect(summary.status).toBe(200);
    expect(summary.body.sections).toEqual([]);
    expect(summary.body.projectHealth.dimensions).toEqual(general.body.projectHealth.dimensions);
    expect(summary.body.projectHealth.score).toBe(general.body.projectHealth.score);
    expect((await get(f, 'TASK', '&healthOnly=true')).status).toBe(400);
  });
  it('invalid calculator inputs remain observable failures', () => {
    expect(() =>
      calculateFlowTaskHistory({ tasks: [null], movements: [], asOf: new Date(), period: {} })
    ).toThrow(TypeError);
  });
});
