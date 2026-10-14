import { createHash } from 'node:crypto';
import { INDICATORS } from '../../src/modules/indicators/indicators.catalog.js';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ExternalServiceError } from '../../src/shared/errors/index.js';
import { startTestServer } from '../helpers/http-server.js';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

let prisma;
let app;
let githubAnalyticsService;
let serial = 0;
const period = '?startDate=2026-09-01&endDate=2026-09-20&timeZone=UTC';
const at = (day) => new Date(`2026-09-${String(day).padStart(2, '0')}T12:00:00Z`);

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ githubAnalyticsService } =
    await import('../../src/modules/indicators/github-analytics.service.js'));
  ({ default: app } = await import('../../src/app.js'));
  app = await startTestServer(app);
  await cleanTestDatabase(prisma);
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  await cleanTestDatabase(prisma);
});
afterAll(async () => {
  if (prisma) {
    await cleanTestDatabase(prisma);
    await prisma.$disconnect();
  }
});

async function actor() {
  const n = ++serial;
  const user = await prisma.user.create({
    data: {
      name: `P7 ${n}`,
      username: `p7_${n}`,
      email: `p7_${n}@example.invalid`,
      passwordHash: 'artificial',
      emailVerifiedAt: new Date()
    }
  });
  const token = `p7-session-${n}`;
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      csrfTokenHash: createHash('sha256').update('artificial').digest('hex'),
      sessionVersion: user.sessionVersion,
      expiresAt: new Date(Date.now() + 600000)
    }
  });
  return { ...user, token };
}

async function project(owner) {
  const n = ++serial;
  return prisma.project.create({
    data: {
      name: `P7 ${n}`,
      responsibleTeam: 'Equipe artificial',
      accessCode: `P7-${n}`,
      memberships: { create: { userId: owner.id, role: 'OWNER' } }
    }
  });
}

const get = (projectId, person, endpoint, query = '') => {
  const call = request(app).get(`/api/projects/${projectId}/indicators/${endpoint}${query}`);
  return person ? call.set('Cookie', `traceflow_session=${person.token}`) : call;
};

const indicatorMap = (response) =>
  Object.fromEntries(
    response.body.sections
      .flatMap((section) => section.indicators)
      .map((row) => [row.metricId, row])
  );

describe('P7 aggregate dashboard API', () => {
  it('P8.3 avalia fatos atuais na GENERAL e TASK sem usar ausência como zero', async () => {
    const owner = await actor();
    const p = await project(owner);
    await prisma.task.createMany({
      data: [
        {
          projectId: p.id,
          title: 'Artificial overdue',
          status: 'A_FAZER',
          deadline: new Date(Date.now() - 86400000)
        },
        {
          projectId: p.id,
          title: 'Artificial assigned',
          status: 'A_FAZER',
          responsibleUserId: owner.id,
          estimatedEffort: 2
        }
      ]
    });
    const general = await get(p.id, owner, 'dashboard');
    expect(general.status, JSON.stringify(general.body)).toBe(200);
    expect(indicatorMap(general).I28.assessment).toMatchObject({
      status: 'CRITICAL',
      score: 50,
      reasonCode: 'TASK_SHARE',
      basis: { count: 1, totalTasks: 2 }
    });
    expect(
      general.body.projectHealth.dimensions.find((item) => item.id === 'PLANNING')
    ).toMatchObject({
      coverage: 100,
      score: 50,
      status: 'CRITICAL'
    });
    expect(general.body.projectHealth).toMatchObject({ score: null, status: 'UNASSESSED' });
    const task = await get(p.id, owner, 'dashboard', '?view=TASK');
    expect(task.status).toBe(200);
    expect(task.body.projectHealth).toBeUndefined();
    expect(indicatorMap(task).I29.assessment).toMatchObject({ score: 50, status: 'CRITICAL' });
    expect(indicatorMap(task).I30.assessment).toMatchObject({ score: 50, status: 'CRITICAL' });
  });

  it('P8.5 includes full Health in every requested category with one shared context', async () => {
    const owner = await actor();
    const p = await project(owner);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
    // Equal one-day current/previous flow and merge samples: no regression.
    await prisma.projectGitHubIntegration.create({
      data: {
        projectId: p.id,
        status: 'ACTIVE',
        lastSyncAt: at(30),
        lastSyncStatus: 'SINCRONIZADO',
        pullRequestLifecycleCoverageFrom: new Date('2026-08-01'),
        pullRequestLifecycleSyncedAt: at(30)
      }
    });
    const requirement = await prisma.requirement.create({
      data: { projectId: p.id, title: 'Implemented', status: 'CONCLUIDO' }
    });
    const sprint = await prisma.sprint.create({
      data: {
        projectId: p.id,
        name: 'Health sprint',
        status: 'EM_ANDAMENTO',
        startDate: at(1),
        endDate: at(30),
        startedAt: at(1),
        planningSnapshotAt: at(1)
      }
    });
    for (const [index, created] of [
      new Date('2026-08-20T12:00:00Z'),
      new Date('2026-08-21T12:00:00Z'),
      new Date('2026-08-22T12:00:00Z'),
      at(3),
      at(4),
      at(5)
    ].entries()) {
      const completed = new Date(created.getTime() + 86400000);
      const pull = await prisma.pullRequest.create({
        data: {
          projectId: p.id,
          githubId: `health-${index}`,
          number: index + 1,
          title: 'Merged',
          state: 'closed',
          createdAtGithub: created,
          mergedAtGithub: completed
        }
      });
      await prisma.pullRequestLifecycleEvent.create({
        data: {
          projectId: p.id,
          pullRequestId: pull.id,
          providerEventId: `health-closed-${index}`,
          eventType: 'CLOSED',
          occurredAt: completed
        }
      });
      const task = await prisma.task.create({
        data: {
          projectId: p.id,
          title: `Complete ${index}`,
          status: 'CONCLUIDO',
          responsibleUserId: owner.id,
          estimatedEffort: 3,
          actualEffort: 3,
          createdAt: created,
          requirementId: requirement.id,
          pullRequestId: pull.id,
          ...(index >= 3 ? { sprintId: sprint.id } : {})
        }
      });
      await prisma.taskMovement.createMany({
        data: [
          {
            projectId: p.id,
            taskId: task.id,
            fromStatus: 'A_FAZER',
            toStatus: 'EM_ANDAMENTO',
            movedAt: created,
            movedBy: 'Health fixture'
          },
          {
            projectId: p.id,
            taskId: task.id,
            fromStatus: 'EM_ANDAMENTO',
            toStatus: 'CONCLUIDO',
            movedAt: completed,
            movedBy: 'Health fixture'
          }
        ]
      });
      if (index >= 3)
        await prisma.sprintTask.create({
          data: {
            projectId: p.id,
            sprintId: sprint.id,
            taskId: task.id,
            taskTitleSnapshot: task.title,
            addedAt: at(1),
            plannedAtStart: true,
            pointsAtPlanning: 3
          }
        });
    }
    const general = await get(p.id, owner, 'dashboard', period);
    // Five scored dimensions: 20+20+15+15+5 weight. Traceability has
    // three perfect signals and two missing-test gaps, so 60; (6000+900)/75 = 92.
    expect(general.body.projectHealth).toMatchObject({
      score: 92,
      status: 'HEALTHY',
      coverage: 83.75,
      assessedDimensions: 5,
      applicableDimensions: 6
    });
    expect(
      general.body.projectHealth.dimensions.map(({ id, score, coverage }) => ({
        id,
        score,
        coverage
      }))
    ).toEqual([
      { id: 'PLANNING', score: 100, coverage: 100 },
      { id: 'FLOW', score: 100, coverage: 100 },
      { id: 'SPRINT', score: 100, coverage: 100 },
      { id: 'QUALITY', score: null, coverage: 35 },
      { id: 'TRACEABILITY', score: 60, coverage: 100 },
      { id: 'TECHNICAL_INTEGRATION', score: 100, coverage: 100 }
    ]);
    expect(general.body.projectHealth.assessments.I04).toMatchObject({
      score: 100,
      basis: { value: 0 }
    });

    for (const view of [
      'PLANNING',
      'GITHUB',
      'FLOW',
      'SPRINT',
      'TASK',
      'QUALITY',
      'TRACEABILITY'
    ]) {
      const response = await get(
        p.id,
        owner,
        'dashboard',
        `${period}&view=${view}&includeProjectHealth=true`
      );
      expect(response.status).toBe(200);
      expect(response.body.projectHealth, view).toMatchObject({
        score: 92,
        coverage: 83.75,
        assessedDimensions: 5
      });
      expect(response.body.projectHealth.dimensions, view).toEqual(
        general.body.projectHealth.dimensions
      );
      expect(response.body.projectHealth.window).toEqual(general.body.projectHealth.window);
      expect(response.body.projectHealth.calculatedAt).toBe(response.body.generatedAt);
      expect(
        response.body.sections
          .flatMap((s) => s.indicators)
          .every((i) => i.projectId === p.id && i.assessment && Number.isFinite(Date.parse(i.asOf)))
      ).toBe(true);
      expect(Buffer.byteLength(JSON.stringify(response.body))).toBeLessThan(256 * 1024);
    }
    expect((await get(p.id, owner, 'dashboard', '?includeProjectHealth=invalid')).status).toBe(400);
  });

  it('entrega GENERAL padrão sem período, com estado e filtros honestos', async () => {
    const owner = await actor();
    const p = await project(owner);
    const response = await get(p.id, owner, 'dashboard');
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toMatchObject({
      projectId: p.id,
      view: 'GENERAL',
      viewState: 'PARTIAL',
      dashboardContractVersion: 1,
      requestedFilters: { period: null, sprintId: null, responsibleUserId: null }
    });
    expect(response.body.sections.map((section) => section.id)).toEqual(['summary', 'sprint']);
    const filtered = await get(
      p.id,
      owner,
      'dashboard?startDate=2026-09-01&endDate=2026-09-20&timeZone=America%2FSao_Paulo'
    );
    expect(filtered.status).toBe(200);
    expect(filtered.body.projectHealth.window.current).toEqual({
      startInclusive: '2026-09-01T03:00:00.000Z',
      endExclusive: '2026-09-21T03:00:00.000Z'
    });
    expect(filtered.body.warnings).not.toContainEqual({
      code: 'PERIOD_FILTER_NOT_APPLIED_TO_VIEW'
    });
    expect(response.body.freshness.local.generatedAt).toBe(response.body.generatedAt);
    expect(response.body.freshness.github).toBeNull();
    expect(response.body.projectHealth).toMatchObject({
      healthModelVersion: 1,
      score: null,
      status: 'UNASSESSED',
      assessedDimensions: 0,
      applicableDimensions: 4,
      calculatedAt: response.body.generatedAt,
      window: { timeZone: 'UTC' }
    });
    expect(response.body.projectHealth.dimensions).toHaveLength(6);
    expect(Object.keys(indicatorMap(response))).toEqual([
      'I01',
      'I23',
      'I28',
      'I61',
      'I66',
      'I53',
      'I45',
      'I46'
    ]);
    expect(indicatorMap(response).I23).toMatchObject({
      value: 0,
      period: null,
      state: 'AVAILABLE'
    });
    expect(indicatorMap(response).I45).toMatchObject({ value: null, state: 'NO_DATA' });
    expect(indicatorMap(response).I28.assessment).toMatchObject({
      healthRole: 'SCORING_SIGNAL',
      dimension: 'PLANNING',
      score: null,
      status: 'UNASSESSED'
    });
    for (const indicator of Object.values(indicatorMap(response)))
      expect(indicator.assessment).toMatchObject({ healthModelVersion: 1 });
  });

  it('mantém current-state fora do período e aplica a janela nos eventos', async () => {
    const owner = await actor();
    const p = await project(owner);
    const task = await prisma.task.create({
      data: { projectId: p.id, title: 'P7 Task', status: 'EM_ANDAMENTO' }
    });
    await prisma.taskMovement.createMany({
      data: [
        {
          projectId: p.id,
          taskId: task.id,
          fromStatus: 'A_FAZER',
          toStatus: 'EM_ANDAMENTO',
          movedAt: at(1),
          movedBy: 'P7'
        },
        {
          projectId: p.id,
          taskId: task.id,
          fromStatus: 'EM_ANDAMENTO',
          toStatus: 'CONCLUIDO',
          movedAt: at(2),
          movedBy: 'P7'
        },
        {
          projectId: p.id,
          taskId: task.id,
          fromStatus: 'CONCLUIDO',
          toStatus: 'EM_ANDAMENTO',
          movedAt: at(20),
          movedBy: 'P7'
        }
      ]
    });
    const response = await get(
      p.id,
      owner,
      'dashboard',
      `?view=FLOW&startDate=2026-09-01&endDate=2026-09-19&timeZone=UTC`
    );
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const i = indicatorMap(response);
    expect(i.I23).toMatchObject({ value: 1, period: null, appliedFilters: { period: false } });
    expect(i.I22).toMatchObject({
      value: 1,
      period: { startDate: '2026-09-01', endDate: '2026-09-19' },
      appliedFilters: { period: true }
    });
    expect(i.I22.eventClock).toBe('TaskMovement.movedAt');
    expect(response.body.requestedFilters.period.endExclusive).toBe('2026-09-20T00:00:00.000Z');
  });

  it('exige período apenas para eventos e preserva métricas atuais em blocos mistos', async () => {
    const owner = await actor();
    const p = await project(owner);
    await prisma.projectGitHubIntegration.create({
      data: {
        projectId: p.id,
        status: 'ACTIVE',
        lastSyncStatus: 'SINCRONIZADO',
        lastSyncAt: new Date()
      }
    });
    const github = await get(p.id, owner, 'dashboard', '?view=GITHUB');
    const quality = await get(p.id, owner, 'dashboard', '?view=QUALITY');
    expect(github.status).toBe(200);
    expect(quality.status).toBe(200);
    expect(indicatorMap(github).I02).toMatchObject({
      state: 'UNAVAILABLE',
      value: null,
      limitations: expect.arrayContaining(['PERIOD_REQUIRED'])
    });
    expect(indicatorMap(github).I10).toMatchObject({ period: null });
    expect(indicatorMap(github).I15.assessment).toMatchObject({
      status: 'UNASSESSED',
      score: null
    });
    expect(indicatorMap(quality).I48).toMatchObject({
      state: 'UNAVAILABLE',
      limitations: expect.arrayContaining(['PERIOD_REQUIRED'])
    });
    expect(indicatorMap(quality).I53).toMatchObject({ period: null, state: 'AVAILABLE' });
    expect(indicatorMap(quality).I49.assessment).toMatchObject({
      status: 'UNASSESSED',
      score: null
    });
  });

  it('compõe as oito views e publica catálogo sem I68 ou metadata privada', async () => {
    const owner = await actor();
    const p = await project(owner);
    const expectedIds = {
      GENERAL: ['I01', 'I23', 'I28', 'I61', 'I66', 'I53', 'I45', 'I46'],
      PLANNING: ['I26', 'I28', 'I29', 'I30', 'I31', 'I32', 'I33', 'I34'],
      GITHUB: [
        'I02',
        'I09',
        'I04',
        'I06',
        'I10',
        'I11',
        'I12',
        'I15',
        'I16',
        'I17',
        'I73',
        'I13',
        'I14',
        'I18',
        'I74'
      ],
      FLOW: ['I20', 'I21', 'I22', 'I23', 'I24', 'I25'],
      SPRINT: [
        'I36',
        'I37',
        'I38',
        'I39',
        'I40',
        'I41',
        'I42',
        'I43',
        'I44',
        'I45',
        'I46',
        'I47',
        'I71',
        'I72'
      ],
      TASK: ['I26', 'I27', 'I28', 'I29', 'I30', 'I31', 'I32', 'I33', 'I34', 'I35'],
      QUALITY: [
        'I06',
        'I48',
        'I49',
        'I50',
        'I51',
        'I52',
        'I53',
        'I54',
        'I55',
        'I56',
        'I57',
        'I58',
        'I59',
        'I60'
      ],
      TRACEABILITY: ['I61', 'I62', 'I63', 'I64', 'I65', 'I66', 'I67']
    };
    for (const view of [
      'GENERAL',
      'PLANNING',
      'GITHUB',
      'FLOW',
      'SPRINT',
      'TASK',
      'QUALITY',
      'TRACEABILITY'
    ]) {
      const response = await get(p.id, owner, 'dashboard', `?view=${view}&${period.slice(1)}`);
      const payloadBytes = Buffer.byteLength(JSON.stringify(response.body));
      expect(response.status, `${view}: ${JSON.stringify(response.body)}`).toBe(200);
      expect(payloadBytes).toBeLessThan(256 * 1024);
      const ids = response.body.sections.flatMap((section) =>
        section.indicators.map((item) => item.metricId)
      );
      expect(ids).toEqual(expectedIds[view]);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).not.toContain('I68');
      for (const metric of response.body.sections.flatMap((section) => section.indicators)) {
        expect(metric.formula, `${view}: ${metric.metricId}`).toBe(
          INDICATORS[metric.metricId].formula
        );
        expect(metric.sources).toEqual(INDICATORS[metric.metricId].sources);
        expect(Number.isFinite(Date.parse(metric.asOf))).toBe(true);
      }
      expect(
        response.body.sections.every((section) =>
          section.indicators.every((item) => item.definitionVersion)
        )
      ).toBe(true);
    }
    const catalog = await get(p.id, owner, 'catalog');
    expect(catalog.status).toBe(200);
    expect(catalog.body.views).toHaveLength(8);
    expect(catalog.body.views.find((item) => item.view === 'GENERAL')).toMatchObject({
      periodIncludesProjectHealth: true,
      filterCompatibility: { period: 'SUPPORTED', responsible: 'UNSAFE' }
    });
    expect(catalog.body.indicators).not.toContainEqual(
      expect.objectContaining({ metricId: 'I68' })
    );
    expect(catalog.body.indicators.find((item) => item.metricId === 'I45')).toMatchObject({
      definitionVersion: 2,
      healthRole: 'SCORING_SIGNAL',
      healthDimension: 'SPRINT',
      healthModelVersion: 1,
      visualizations: ['LINE'],
      supportedFilters: ['sprintId']
    });
    expect(JSON.stringify(catalog.body)).not.toContain('passwordHash');
  });

  it('valida filtros, isolamento e evita IDOR', async () => {
    const owner = await actor();
    const p = await project(owner);
    const other = await project(owner);
    const outsider = await actor();
    const sprint = await prisma.sprint.create({
      data: { projectId: other.id, name: 'Other', startDate: at(1), endDate: at(10) }
    });
    expect((await get(p.id, null, 'dashboard')).status).toBe(401);
    expect((await get(p.id, outsider, 'dashboard')).status).toBe(404);
    expect((await get(p.id, owner, 'dashboard', '?view=INVALID')).status).toBe(400);
    expect((await get(p.id, owner, 'dashboard', '?unexpected=1')).status).toBe(400);
    expect((await get(p.id, owner, 'dashboard', '?startDate=2026-09-01')).status).toBe(400);
    expect(
      (await get(p.id, owner, 'dashboard', '?startDate=2026-09-20&endDate=2026-09-01&timeZone=UTC'))
        .status
    ).toBe(400);
    expect(
      (
        await get(
          p.id,
          owner,
          'dashboard',
          '?startDate=2026-09-01&endDate=2026-09-20&timeZone=Invalid/Zone'
        )
      ).status
    ).toBe(400);
    expect(
      (
        await get(
          p.id,
          owner,
          'dashboard',
          '?view=TASK&startDate=2025-01-01&endDate=2026-09-20&timeZone=UTC'
        )
      ).status
    ).toBe(400);
    expect((await get(p.id, owner, 'dashboard', `?sprintId=${sprint.id}`)).status).toBe(404);
    expect((await get(p.id, owner, 'dashboard', `?responsibleUserId=${outsider.id}`)).status).toBe(
      404
    );
    expect((await get(p.id, outsider, 'catalog')).status).toBe(404);
    await prisma.project.update({ where: { id: p.id }, data: { deletedAt: new Date() } });
    expect((await get(p.id, owner, 'dashboard')).status).toBe(404);
    expect((await get(p.id, owner, 'catalog')).status).toBe(404);
  });

  it('permite Dashboard e catálogo a cada papel ativo sem expor projeto alheio', async () => {
    const owner = await actor();
    const p = await project(owner);
    for (const role of ['VIEWER', 'MEMBER', 'MANAGER']) {
      const member = await actor();
      await prisma.projectMembership.create({
        data: { projectId: p.id, userId: member.id, role }
      });
      expect((await get(p.id, member, 'dashboard')).status).toBe(200);
      expect((await get(p.id, member, 'catalog')).status).toBe(200);
    }
    expect((await get(p.id, owner, 'dashboard')).status).toBe(200);
  });

  it('aplica Sprint apenas aos indicadores compatíveis e valida responsável histórico sem reatribuir fatos', async () => {
    const owner = await actor();
    const p = await project(owner);
    const sprint = await prisma.sprint.create({
      data: {
        projectId: p.id,
        name: 'P7 Sprint',
        startDate: at(1),
        endDate: at(10),
        status: 'EM_ANDAMENTO',
        startedAt: at(1)
      }
    });
    const former = await actor();
    await prisma.projectMembership.create({
      data: { projectId: p.id, userId: former.id, role: 'MEMBER', isActive: false }
    });
    const sprintView = await get(p.id, owner, 'dashboard', `?view=SPRINT&sprintId=${sprint.id}`);
    expect(sprintView.status, JSON.stringify(sprintView.body)).toBe(200);
    expect(sprintView.body.context.sprint.id).toBe(sprint.id);
    expect(indicatorMap(sprintView).I45.appliedFilters.sprint).toBe(true);
    expect(indicatorMap(sprintView).I47.appliedFilters.sprint).toBe(false);
    const github = await get(
      p.id,
      owner,
      'dashboard',
      `?view=GITHUB&responsibleUserId=${former.id}&${period.slice(1)}`
    );
    expect(github.status, JSON.stringify(github.body)).toBe(200);
    expect(github.body.context.responsible).toMatchObject({ userId: former.id });
    expect(indicatorMap(github).I02).toMatchObject({
      filterCompatibility: { responsible: 'UNSAFE' },
      appliedFilters: { responsible: false }
    });
    expect(github.body.warnings).toContainEqual({ code: 'RESPONSIBLE_FILTER_NOT_APPLIED_TO_VIEW' });
  });

  it('normaliza um dia com DST da mesma forma para Flow e Quality', async () => {
    const owner = await actor();
    const p = await project(owner);
    const query = 'startDate=2026-03-08&endDate=2026-03-08&timeZone=America/New_York';
    const flow = await get(p.id, owner, 'dashboard', `?view=FLOW&${query}`);
    const quality = await get(p.id, owner, 'dashboard', `?view=QUALITY&${query}`);
    expect(flow.status).toBe(200);
    expect(quality.status).toBe(200);
    const expected = {
      startInclusive: '2026-03-08T05:00:00.000Z',
      endExclusive: '2026-03-09T04:00:00.000Z'
    };
    expect(flow.body.requestedFilters.period).toMatchObject(expected);
    expect(quality.body.requestedFilters.period).toMatchObject(expected);
    expect(indicatorMap(flow).I22.period).toMatchObject(expected);
    expect(indicatorMap(quality).I48.period).toMatchObject(expected);
    expect(indicatorMap(flow).I23.period).toBeNull();
    expect(indicatorMap(quality).I53.period).toBeNull();
  });

  it('respeita startInclusive e endExclusive em relógios diferentes da mesma view', async () => {
    const owner = await actor();
    const p = await project(owner);
    const tc = await prisma.testCase.create({
      data: {
        projectId: p.id,
        title: 'P7 case',
        preconditions: 'Ready',
        expectedResult: 'Works',
        responsibleUserId: owner.id
      }
    });
    const version = await prisma.testCaseVersion.create({
      data: {
        testCaseId: tc.id,
        version: 1,
        snapshotJson: { title: tc.title }
      }
    });
    const commit = await prisma.commit.create({ data: { projectId: p.id, hash: '7'.repeat(40) } });
    const start = new Date('2026-09-01T00:00:00.000Z');
    const end = new Date('2026-09-21T00:00:00.000Z');
    const first = await prisma.testExecution.create({
      data: {
        projectId: p.id,
        testCaseId: tc.id,
        testCaseVersionId: version.id,
        testCaseVersion: 1,
        environment: 'LOCAL',
        result: 'FAIL',
        testedReferenceType: 'COMMIT',
        testedCommitId: commit.id,
        testedReferenceSnapshot: { hash: commit.hash },
        executedByDisplayNameSnapshot: 'P7 executor',
        executedAt: start
      }
    });
    const step = await prisma.testExecutionStep.create({
      data: {
        executionId: first.id,
        position: 1,
        actionSnapshot: 'Open',
        expectedResultSnapshot: 'Works',
        result: 'FAIL'
      }
    });
    await prisma.testExecution.create({
      data: {
        projectId: p.id,
        testCaseId: tc.id,
        testCaseVersionId: version.id,
        testCaseVersion: 1,
        environment: 'LOCAL',
        result: 'PASS',
        testedReferenceType: 'COMMIT',
        testedCommitId: commit.id,
        testedReferenceSnapshot: { hash: commit.hash },
        executedByDisplayNameSnapshot: 'P7 executor',
        executedAt: end
      }
    });
    const defect = await prisma.defect.create({
      data: {
        projectId: p.id,
        title: 'At start',
        description: 'Mismatch',
        severity: 'ALTA',
        responsibleUserId: owner.id,
        detectedExecutionStepId: step.id,
        createdAt: start
      }
    });
    await prisma.defectHistoryEntry.createMany({
      data: [
        { projectId: p.id, defectId: defect.id, action: 'VALIDATED', occurredAt: start },
        { projectId: p.id, defectId: defect.id, action: 'VALIDATED', occurredAt: end }
      ]
    });
    const response = await get(p.id, owner, 'dashboard', `?view=QUALITY&${period.slice(1)}`);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const i = indicatorMap(response);
    expect(i.I48.value).toEqual({ PASS: 0, FAIL: 1, BLOCKED: 0, total: 1 });
    expect(i.I55.value).toBe(1);
    expect(i.I56.value).toBe(1);
    expect(i.I48.period).toEqual(i.I55.period);
    expect(i.I55.period).toEqual(i.I56.period);
    expect(i.I52.period).toBeNull();
  });

  it('isola falha externa esperada, mas não oculta erro operacional local', async () => {
    const owner = await actor();
    const p = await project(owner);
    await prisma.projectGitHubIntegration.create({
      data: {
        projectId: p.id,
        status: 'ACTIVE',
        lastSyncAt: new Date(),
        lastSyncStatus: 'SINCRONIZADO'
      }
    });
    vi.spyOn(githubAnalyticsService, 'read').mockRejectedValueOnce(
      new ExternalServiceError('GitHub unavailable')
    );
    const partial = await get(p.id, owner, 'dashboard', `?view=QUALITY&${period.slice(1)}`);
    expect(partial.status, JSON.stringify(partial.body)).toBe(200);
    expect(partial.body.viewState).toBe('PARTIAL');
    expect(partial.body.warnings).toContainEqual({ code: 'SOURCE_UNAVAILABLE', source: 'github' });
    expect(partial.body.freshness.github).toBeNull();
    expect(indicatorMap(partial).I06).toMatchObject({ state: 'UNAVAILABLE' });
    expect(indicatorMap(partial).I53).toMatchObject({ state: 'AVAILABLE' });
    const { qualityAnalyticsService } =
      await import('../../src/modules/indicators/quality-analytics.service.js');
    vi.spyOn(qualityAnalyticsService, 'read').mockRejectedValueOnce(new Error('Programming bug'));
    const failed = await get(p.id, owner, 'dashboard', `?view=QUALITY&${period.slice(1)}`);
    expect(failed.status).toBe(500);
    expect(failed.body.message).toBe('Erro interno ao processar solicitação.');
  });
});
