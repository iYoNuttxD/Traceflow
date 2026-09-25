import { createHash } from 'node:crypto';
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
  it('entrega GENERAL padrão sem período, com estado e filtros honestos', async () => {
    const owner = await actor();
    const p = await project(owner);
    const response = await get(p.id, owner, 'dashboard');
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toMatchObject({
      projectId: p.id,
      view: 'GENERAL',
      viewState: 'NO_DATA',
      dashboardContractVersion: 1,
      requestedFilters: { period: null, sprintId: null, responsibleUserId: null }
    });
    expect(response.body.sections.map((section) => section.id)).toEqual(['summary', 'sprint']);
    expect(response.body.freshness.local.generatedAt).toBe(response.body.generatedAt);
    expect(response.body.freshness.github).toBeNull();
    expect(Object.keys(indicatorMap(response))).toEqual([
      'I01',
      'I23',
      'I28',
      'I61',
      'I66',
      'I53',
      'I45'
    ]);
    expect(indicatorMap(response).I23).toMatchObject({
      value: 0,
      period: null,
      state: 'AVAILABLE'
    });
    expect(indicatorMap(response).I45).toMatchObject({ value: null, state: 'NO_DATA' });
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
      period: { startDate: '2026-09-01', endDate: '2026-09-19' },
      appliedFilters: { period: true }
    });
    expect(i.I22.eventClock).toBe('TaskMovement.movedAt');
    expect(response.body.requestedFilters.period.endExclusive).toBe('2026-09-20T00:00:00.000Z');
  });

  it('exige período apenas para eventos e preserva métricas atuais em blocos mistos', async () => {
    const owner = await actor();
    const p = await project(owner);
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
    expect(indicatorMap(quality).I48).toMatchObject({
      state: 'UNAVAILABLE',
      limitations: expect.arrayContaining(['PERIOD_REQUIRED'])
    });
    expect(indicatorMap(quality).I53).toMatchObject({ period: null, state: 'AVAILABLE' });
  });

  it('compõe as sete views e publica catálogo sem I68 ou metadata privada', async () => {
    const owner = await actor();
    const p = await project(owner);
    for (const view of ['GENERAL', 'GITHUB', 'FLOW', 'SPRINT', 'TASK', 'QUALITY', 'TRACEABILITY']) {
      const response = await get(p.id, owner, 'dashboard', `?view=${view}&${period.slice(1)}`);
      const payloadBytes = Buffer.byteLength(JSON.stringify(response.body));
      expect(response.status, `${view}: ${JSON.stringify(response.body)}`).toBe(200);
      expect(payloadBytes).toBeLessThan(256 * 1024);
      const ids = response.body.sections.flatMap((section) =>
        section.indicators.map((item) => item.metricId)
      );
      expect(ids.length).toBeGreaterThan(0);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).not.toContain('I68');
      expect(
        response.body.sections.every((section) =>
          section.indicators.every((item) => item.definitionVersion)
        )
      ).toBe(true);
    }
    const catalog = await get(p.id, owner, 'catalog');
    expect(catalog.status).toBe(200);
    expect(catalog.body.indicators).not.toContainEqual(
      expect.objectContaining({ metricId: 'I68' })
    );
    expect(catalog.body.indicators.find((item) => item.metricId === 'I45')).toMatchObject({
      definitionVersion: 2,
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
