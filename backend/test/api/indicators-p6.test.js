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
const at = (day) => new Date(`2026-09-${String(day).padStart(2, '0')}T12:00:00Z`);
const period = '?startDate=2026-09-01&endDate=2026-09-20&timeZone=UTC';

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

async function actor(projectId = null, role = 'VIEWER') {
  const n = ++serial;
  const user = await prisma.user.create({
    data: {
      name: `P6 ${n}`,
      username: `p6_${n}`,
      email: `p6_${n}@example.invalid`,
      passwordHash: 'artificial',
      emailVerifiedAt: new Date()
    }
  });
  const token = `p6-session-${n}`;
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      csrfTokenHash: createHash('sha256').update('artificial').digest('hex'),
      sessionVersion: user.sessionVersion,
      expiresAt: new Date(Date.now() + 600000)
    }
  });
  if (projectId)
    await prisma.projectMembership.create({ data: { projectId, userId: user.id, role } });
  return { ...user, token };
}

async function project(owner) {
  const n = ++serial;
  return prisma.project.create({
    data: {
      name: `P6 ${n}`,
      responsibleTeam: 'Equipe artificial',
      accessCode: `P6-${n}`,
      memberships: { create: { userId: owner.id, role: 'OWNER' } }
    }
  });
}

async function testCase(projectId, userId, requirementId = null, data = {}) {
  const n = ++serial;
  const row = await prisma.testCase.create({
    data: {
      projectId,
      title: `P6 Case ${n}`,
      preconditions: 'Ready',
      expectedResult: 'Works',
      responsibleUserId: userId,
      requirementId,
      ...data
    }
  });
  const versions = [];
  for (let version = 1; version <= row.currentVersion; version++) {
    versions.push(
      await prisma.testCaseVersion.create({
        data: { testCaseId: row.id, version, snapshotJson: { title: row.title } }
      })
    );
  }
  return { row, versions };
}

async function execution(projectId, tc, result, day, version = tc.row.currentVersion) {
  const n = ++serial;
  const hash = String(n).padStart(40, '0');
  const commit = await prisma.commit.create({ data: { projectId, hash } });
  const row = await prisma.testExecution.create({
    data: {
      projectId,
      testCaseId: tc.row.id,
      testCaseVersionId: tc.versions[version - 1].id,
      testCaseVersion: version,
      environment: 'LOCAL',
      result,
      testedReferenceType: 'COMMIT',
      testedCommitId: commit.id,
      testedReferenceSnapshot: { hash },
      executedByDisplayNameSnapshot: 'P6 executor',
      executedAt: at(day)
    }
  });
  const step = await prisma.testExecutionStep.create({
    data: {
      executionId: row.id,
      position: 1,
      actionSnapshot: 'Open',
      expectedResultSnapshot: 'Works',
      result
    }
  });
  return { ...row, step };
}

async function defect(projectId, userId, stepId, data = {}) {
  const n = ++serial;
  return prisma.defect.create({
    data: {
      projectId,
      title: `P6 Defect ${n}`,
      description: 'Mismatch',
      severity: 'ALTA',
      responsibleUserId: userId,
      detectedExecutionStepId: stepId,
      createdAt: at(2),
      ...data
    }
  });
}

const get = (projectId, person, kind, query = '') => {
  const call = request(app).get(`/api/projects/${projectId}/indicators/${kind}${query}`);
  return person ? call.set('Cookie', `traceflow_session=${person.token}`) : call;
};
const indicators = (response) =>
  Object.fromEntries(response.body.indicators.map((item) => [item.metricId, item]));

describe('P6 Quality and Traceability analytics API', () => {
  it('aplica autenticação, isolamento de projeto e query estrita', async () => {
    const owner = await actor();
    const p = await project(owner);
    const viewer = await actor(p.id);
    const outsider = await actor();
    expect((await get(p.id, null, 'quality', period)).status).toBe(401);
    expect((await get(p.id, outsider, 'quality', period)).status).toBe(404);
    expect((await get(p.id, outsider, 'traceability')).status).toBe(404);
    const emptyQuality = await get(p.id, viewer, 'quality', period);
    const emptyTraceability = await get(p.id, viewer, 'traceability');
    expect(emptyQuality.status).toBe(200);
    expect(emptyTraceability.status).toBe(200);
    expect(indicators(emptyQuality).I49).toMatchObject({
      value: null,
      denominator: 0,
      state: 'NO_DATA'
    });
    expect(indicators(emptyTraceability).I61).toMatchObject({
      value: null,
      denominator: 0,
      state: 'NO_DATA'
    });
    expect((await get(p.id, viewer, 'quality')).status).toBe(400);
    expect((await get(p.id, viewer, 'quality', `${period}&responsibleUserId=1`)).status).toBe(400);
    expect((await get(p.id, viewer, 'traceability', period)).status).toBe(400);
    await prisma.project.update({ where: { id: p.id }, data: { deletedAt: new Date() } });
    expect((await get(p.id, viewer, 'quality', period)).status).toBe(404);
    expect((await get(p.id, viewer, 'traceability')).status).toBe(404);
  });

  it('separa execuções do período da saúde atual da versão corrente', async () => {
    const owner = await actor();
    const p = await project(owner);
    const old = await testCase(p.id, owner.id, null, { currentVersion: 2 });
    await execution(p.id, old, 'PASS', 3, 1);
    const current = await testCase(p.id, owner.id);
    await execution(p.id, current, 'FAIL', 4);
    await execution(p.id, current, 'BLOCKED', 5);
    const i = indicators(await get(p.id, owner, 'quality', period));
    expect(i.I48).toMatchObject({ value: { PASS: 1, FAIL: 1, BLOCKED: 1, total: 3 } });
    expect(i.I49).toMatchObject({ value: 33.33, numerator: 1, denominator: 3 });
    expect(i.I50.value).toBe(33.33);
    expect(i.I51.value).toBe(33.33);
    expect(i.I52.value).toEqual({ PASS: 0, FAIL: 0, BLOCKED: 1, NEVER_EXECUTED: 1, total: 2 });
    expect(i.I52.period).toBeNull();
  });

  it('conta validação distinta, primeira validação e tentativas reais de reteste', async () => {
    const owner = await actor();
    const p = await project(owner);
    const tc = await testCase(p.id, owner.id);
    const failed = await execution(p.id, tc, 'FAIL', 3);
    const d = await defect(p.id, owner.id, failed.step.id, { status: 'VALIDADO' });
    await prisma.defectHistoryEntry.createMany({
      data: [
        { projectId: p.id, defectId: d.id, action: 'VALIDATED', occurredAt: at(5) },
        { projectId: p.id, defectId: d.id, action: 'VALIDATED', occurredAt: at(8) }
      ]
    });
    const blocked = await execution(p.id, tc, 'BLOCKED', 7);
    const passed = await execution(p.id, tc, 'PASS', 9);
    await prisma.defectRetest.createMany({
      data: [
        { defectId: d.id, testExecutionId: blocked.id, correctionCycle: 1 },
        { defectId: d.id, testExecutionId: passed.id, correctionCycle: 2 }
      ]
    });
    const i = indicators(await get(p.id, owner, 'quality', period));
    expect(i.I53.value.VALIDADO).toBe(1);
    expect(i.I54.value.ALTA).toBe(1);
    expect(i.I55.value).toBe(1);
    expect(i.I56.value).toBe(1);
    expect(i.I57).toMatchObject({ value: 3, eligibleCount: 1 });
    expect(i.I58).toMatchObject({ value: 50, numerator: 1, denominator: 2 });
    expect(i.I58.distribution).toEqual({ PASS: 1, FAIL: 0, BLOCKED: 1, total: 2 });
  });

  it('expõe limites de exclusão lógica e validação legada sem inventar relógio', async () => {
    const owner = await actor();
    const p = await project(owner);
    const tc = await testCase(p.id, owner.id);
    const failed = await execution(p.id, tc, 'FAIL', 3);
    await defect(p.id, owner.id, failed.step.id, { status: 'VALIDADO' });
    const deleted = await defect(p.id, owner.id, failed.step.id, {
      status: 'VALIDADO',
      deletedAt: at(10)
    });
    await prisma.defectHistoryEntry.create({
      data: { projectId: p.id, defectId: deleted.id, action: 'VALIDATED', occurredAt: at(6) }
    });
    const passed = await execution(p.id, tc, 'PASS', 7);
    await prisma.defectRetest.create({
      data: { defectId: deleted.id, testExecutionId: passed.id, correctionCycle: 1 }
    });
    const i = indicators(await get(p.id, owner, 'quality', period));
    expect(i.I55).toMatchObject({ value: 1, excludedCount: 1, state: 'PARTIAL' });
    expect(i.I56).toMatchObject({ value: 0, excludedCount: 2, state: 'PARTIAL' });
    expect(i.I56.limitations).toContain('LEGACY_VALIDATION_WITHOUT_EVENT_UNDATED');
    expect(i.I57).toMatchObject({
      value: null,
      eligibleCount: 0,
      excludedCount: 2,
      state: 'UNAVAILABLE'
    });
    expect(i.I58).toMatchObject({ value: null, excludedCount: 1, state: 'UNAVAILABLE' });
    expect(i.I53.value.VALIDADO).toBe(1);
  });

  it('deduplica Requirement e usa somente Task ORIGIN na concentração', async () => {
    const owner = await actor();
    const p = await project(owner);
    const req = await prisma.requirement.create({ data: { projectId: p.id, title: 'R1' } });
    const other = await prisma.requirement.create({ data: { projectId: p.id, title: 'R2' } });
    const origin = await prisma.task.create({
      data: { projectId: p.id, requirementId: req.id, title: 'Origin' }
    });
    const correction = await prisma.task.create({
      data: { projectId: p.id, requirementId: other.id, title: 'Correction' }
    });
    const tc = await testCase(p.id, owner.id, req.id);
    const failed = await execution(p.id, tc, 'FAIL', 3);
    const d = await defect(p.id, owner.id, failed.step.id, { requirementId: req.id });
    await prisma.defectTask.createMany({
      data: [
        { defectId: d.id, taskId: origin.id, relationType: 'ORIGIN' },
        { defectId: d.id, taskId: correction.id, relationType: 'CORRECTION', correctionCycle: 1 }
      ]
    });
    const qualityResponse = await get(p.id, owner, 'quality', period);
    expect(qualityResponse.status, JSON.stringify(qualityResponse.body)).toBe(200);
    const quality = indicators(qualityResponse);
    expect(quality.I59.items).toEqual([
      { requirementId: req.id, displayId: `REQ-${req.id}`, title: 'R1', defectCount: 1 }
    ]);
    expect(quality.I60.items).toEqual([{ taskId: origin.id, title: 'Origin', defectCount: 1 }]);
    const otherOrigin = await prisma.task.create({
      data: { projectId: p.id, requirementId: other.id, title: 'Other origin' }
    });
    await prisma.defectTask.create({
      data: { defectId: d.id, taskId: otherOrigin.id, relationType: 'ORIGIN' }
    });
    const multiple = indicators(await get(p.id, owner, 'quality', period));
    expect(multiple.I59.items.map((item) => [item.requirementId, item.defectCount])).toEqual([
      [req.id, 1],
      [other.id, 1]
    ]);
    expect(multiple.I60.items.map((item) => item.taskId)).toEqual([origin.id, otherOrigin.id]);
    const pr = await prisma.pullRequest.create({
      data: { projectId: p.id, githubId: `p6-${++serial}`, number: serial, title: 'P6 PR' }
    });
    await prisma.task.update({
      where: { id: origin.id },
      data: { status: 'CONCLUIDO', pullRequestId: pr.id }
    });
    const trace = indicators(await get(p.id, owner, 'traceability'));
    expect(trace.I61).toMatchObject({
      numerator: 2,
      denominator: 2,
      value: 100,
      state: 'AVAILABLE'
    });
    expect(trace.I63.value).toBe(50);
    expect(trace.I64.value).toBe(100);
    expect(trace.I65).toMatchObject({ numerator: 0, denominator: 2 });
    expect(trace.I66).toMatchObject({ numerator: 1, denominator: 2 });
    expect(trace.I67).toMatchObject({ value: 50, state: 'AVAILABLE' });
  });
});
