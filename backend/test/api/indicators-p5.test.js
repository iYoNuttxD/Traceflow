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
const at = (day) => new Date(`2026-09-${String(day).padStart(2, '0')}T00:00:00Z`);

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
      name: `P5 ${n}`,
      username: `p5_${n}`,
      email: `p5_${n}@example.invalid`,
      passwordHash: 'artificial',
      emailVerifiedAt: new Date()
    }
  });
  const token = `p5-session-${n}`;
  await prisma.session.create({
    data: {
      userId: person.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      csrfTokenHash: createHash('sha256').update('artificial').digest('hex'),
      sessionVersion: person.sessionVersion,
      expiresAt: new Date(Date.now() + 600000)
    }
  });
  if (projectId)
    await prisma.projectMembership.create({ data: { projectId, userId: person.id, role } });
  return { ...person, token };
}

async function project(owner) {
  const n = ++serial;
  return prisma.project.create({
    data: {
      name: `P5 ${n}`,
      responsibleTeam: 'Equipe artificial',
      accessCode: `P5-${n}`,
      memberships: { create: { userId: owner.id, role: 'OWNER' } }
    }
  });
}

async function sprint(projectId, status, extra = {}) {
  const n = ++serial;
  return prisma.sprint.create({
    data: {
      projectId,
      name: `P5 Sprint ${n}`,
      startDate: at(1),
      endDate: at(12),
      status,
      ...(status !== 'PLANEJADA' ? { startedAt: at(1), planningSnapshotAt: at(1) } : {}),
      ...(['CONCLUIDA', 'CANCELADA'].includes(status)
        ? { closedAt: at(10), completedAt: at(10) }
        : {}),
      ...extra
    }
  });
}

async function task(projectId, sprintId, data = {}) {
  const n = ++serial;
  return prisma.task.create({
    data: { projectId, sprintId, title: `P5 Task ${n}`, status: 'A_FAZER', ...data }
  });
}

async function participation(projectId, sprintId, taskId, data = {}) {
  return prisma.sprintTask.create({
    data: {
      projectId,
      sprintId,
      taskId,
      taskTitleSnapshot: `Task ${taskId ?? 'excluída'}`,
      addedAt: at(1),
      ...data
    }
  });
}

function get(projectId, person, suffix = '') {
  const call = request(app).get(`/api/projects/${projectId}/indicators/sprints${suffix}`);
  return person ? call.set('Cookie', `traceflow_session=${person.token}`) : call;
}

function indicators(response) {
  return Object.fromEntries(response.body.indicators.map((item) => [item.metricId, item]));
}

describe('Sprint Analytics P5 — API', () => {
  it('sem Sprint ativa devolve NO_DATA para seleção e mantém velocity de projeto separada', async () => {
    const owner = await actor();
    const p = await project(owner);
    const response = await get(p.id, owner);
    expect(response.status).toBe(200);
    expect(response.body.sprint).toBeNull();
    const i = indicators(response);
    expect(Object.keys(i)).toHaveLength(14);
    expect(i.I36).toMatchObject({ value: null, state: 'NO_DATA' });
    expect(i.I45).toMatchObject({ kind: 'SERIES', points: [], state: 'NO_DATA' });
    expect(i.I47).toMatchObject({
      scope: { projectId: p.id, cohort: 'COMPLETED_SPRINTS' },
      state: 'NO_DATA'
    });
    await sprint(p.id, 'EM_ANDAMENTO');
    await sprint(p.id, 'EM_ANDAMENTO');
    const ambiguous = await get(p.id, owner);
    expect(ambiguous.body.sprint).toBeNull();
    expect(indicators(ambiguous).I36).toMatchObject({
      state: 'UNAVAILABLE',
      limitations: ['MULTIPLE_ACTIVE_SPRINTS']
    });
  });

  it('separa baseline, escopo vivo, entrega, carry-over e esforço sem fabricar burnup', async () => {
    const owner = await actor();
    const p = await project(owner);
    const origin = await sprint(p.id, 'CONCLUIDA');
    const current = await sprint(p.id, 'EM_ANDAMENTO');
    const first = await task(p.id, current.id, {
      status: 'CONCLUIDO',
      estimatedEffort: 6,
      actualEffort: 3
    });
    const second = await task(p.id, current.id, { estimatedEffort: 4, actualEffort: 2 });
    const added = await task(p.id, current.id, { estimatedEffort: 4, actualEffort: 2 });
    await participation(p.id, current.id, first.id, { plannedAtStart: true, pointsAtPlanning: 6 });
    await participation(p.id, current.id, second.id, { plannedAtStart: true, pointsAtPlanning: 4 });
    await participation(p.id, current.id, added.id, {
      addedAt: at(2),
      addedAfterStart: true,
      plannedAtStart: false,
      carriedFromSprintId: origin.id
    });
    const response = await get(p.id, owner);
    expect(response.status).toBe(200);
    expect(response.body.sprint).toMatchObject({ id: current.id, frozen: false });
    const i = indicators(response);
    expect(i.I36.value).toBe(10);
    expect(i.I37.value).toBe(14);
    expect(i.I38.value).toBe(6);
    expect(i.I39.value).toBe(2);
    expect(i.I40.value).toBe(1);
    expect(i.I41.value).toBe(1);
    expect(i.I42.value).toBe(0);
    expect(i.I43.value).toEqual({ incoming: 1, outgoing: 0 });
    expect(i.I43.items[0]).toMatchObject({ taskId: added.id, fromSprintId: origin.id });
    expect(i.I44.value).toMatchObject({ estimatedHours: 14, actualHours: 7, differenceHours: -7 });
    expect(i.I45.points).toEqual(
      (
        await request(app)
          .get(`/api/sprints/${current.id}/progress`)
          .set('Cookie', `traceflow_session=${owner.token}`)
      ).body.burndown.days
    );
    expect(i.I46).toMatchObject({ value: null, state: 'UNAVAILABLE', points: [] });
    expect(i.I71.value).toEqual({ addedCount: 1, removedCount: 0, changed: true });
    expect(i.I72).toMatchObject({ value: 1, period: null });
  });

  it('congela pontos, entrega, esforço e burndown apesar de mutações posteriores na Task', async () => {
    const owner = await actor();
    const p = await project(owner);
    const closed = await sprint(p.id, 'CONCLUIDA');
    const done = await task(p.id, closed.id, {
      status: 'CONCLUIDO',
      estimatedEffort: 4,
      actualEffort: 2
    });
    await participation(p.id, closed.id, done.id, {
      plannedAtStart: true,
      pointsAtPlanning: 4,
      pointsAtClose: 4,
      exitStatus: 'CONCLUIDO',
      completedAtClose: at(5),
      closedAt: at(10),
      closingTaskSnapshot: { version: 3, estimatedEffort: 4, actualEffort: 2 }
    });
    const before = indicators(await get(p.id, owner, `?sprintId=${closed.id}`));
    expect(before.I36.value).toBe(4);
    expect(before.I37.value).toBe(4);
    expect(before.I38.value).toBe(4);
    expect(before.I39.value).toBe(1);
    expect(before.I40.value).toBe(1);
    expect(before.I44.value).toMatchObject({ estimatedHours: 4, actualHours: 2 });
    expect(before.I45.points.length).toBeGreaterThan(0);
    await prisma.task.update({
      where: { id: done.id },
      data: { status: 'A_FAZER', estimatedEffort: 100, actualEffort: 100, sprintId: null }
    });
    const after = indicators(await get(p.id, owner, `?sprintId=${closed.id}`));
    for (const id of ['I36', 'I37', 'I38', 'I39', 'I40', 'I44']) {
      expect(after[id].value).toEqual(before[id].value);
    }
    expect(after.I45.points).toEqual(before.I45.points);
    expect(after.I47.points).toEqual(before.I47.points);
    expect(after.I72).toMatchObject({ value: null, state: 'NO_DATA' });
  });

  it('mantém adições e remoções separadas do baseline e sinaliza legado incompleto', async () => {
    const owner = await actor();
    const p = await project(owner);
    const current = await sprint(p.id, 'EM_ANDAMENTO');
    const retained = await task(p.id, current.id, { estimatedEffort: 4 });
    const removed = await task(p.id, null, { estimatedEffort: 3 });
    const added = await task(p.id, current.id, { estimatedEffort: 2 });
    await participation(p.id, current.id, retained.id, {
      plannedAtStart: true,
      pointsAtPlanning: 4
    });
    await participation(p.id, current.id, removed.id, {
      plannedAtStart: true,
      pointsAtPlanning: 3,
      removedAt: at(3),
      removalReason: 'REMOVIDA'
    });
    await participation(p.id, current.id, added.id, {
      plannedAtStart: false,
      addedAfterStart: true,
      addedAt: at(2)
    });
    const i = indicators(await get(p.id, owner));
    expect(i.I36.value).toBe(7);
    expect(i.I37.value).toBe(6);
    expect(i.I39.value).toBe(2);
    expect(i.I41).toMatchObject({ value: 1, state: 'AVAILABLE' });
    expect(i.I42).toMatchObject({ value: 1, state: 'AVAILABLE' });
    expect(i.I71.value).toEqual({ addedCount: 1, removedCount: 1, changed: true });
    await prisma.sprint.update({ where: { id: current.id }, data: { planningSnapshotAt: null } });
    const legacy = indicators(await get(p.id, owner));
    expect(legacy.I36).toMatchObject({ value: null, state: 'UNAVAILABLE' });
    expect(legacy.I39).toMatchObject({ value: null, state: 'UNAVAILABLE' });
    expect(legacy.I41.state).toBe('PARTIAL');
    expect(legacy.I41.limitations).toContain('LEGACY_PLANNING_SNAPSHOT_UNAVAILABLE');
  });

  it('propaga esforço terminal incompleto sem reconstruir de Task viva', async () => {
    const owner = await actor();
    const p = await project(owner);
    const closed = await sprint(p.id, 'CONCLUIDA');
    const t = await task(p.id, closed.id, { estimatedEffort: 0, actualEffort: 8 });
    await participation(p.id, closed.id, t.id, {
      plannedAtStart: true,
      pointsAtPlanning: 0,
      pointsAtClose: 0,
      exitStatus: 'CONCLUIDO',
      closedAt: at(10),
      closingTaskSnapshot: { version: 1 }
    });
    const i = indicators(await get(p.id, owner, `?sprintId=${closed.id}`));
    expect(i.I44.state).toBe('PARTIAL');
    expect(i.I44.components).toMatchObject({ incomplete: true });
    expect(i.I44.coverage).toMatchObject({
      tasksWithUnknownEstimate: 1,
      tasksWithUnknownActual: 1
    });
    expect(i.I44.value.estimatedHours).toBeNull();
    expect(i.I46).toMatchObject({ state: 'UNAVAILABLE', points: [] });
  });

  it('marca o teto de 180 dias do burndown sem alterar os pontos do owner', async () => {
    const owner = await actor();
    const p = await project(owner);
    const long = await sprint(p.id, 'EM_ANDAMENTO', { endDate: new Date('2027-04-01T00:00:00Z') });
    const t = await task(p.id, long.id, { estimatedEffort: 4 });
    await participation(p.id, long.id, t.id, { plannedAtStart: true, pointsAtPlanning: 4 });
    const i = indicators(await get(p.id, owner));
    expect(i.I45).toMatchObject({ state: 'PARTIAL', coverage: { truncated: true } });
    expect(i.I45.points).toHaveLength(180);
    expect(i.I45.limitations).toContain('BURNDOWN_MAX_180_DAYS');
  });

  it('velocity usa somente conclusão íntegra, valida escopo/limite e protege acesso', async () => {
    const owner = await actor();
    const p = await project(owner);
    const other = await project(owner);
    const first = await sprint(p.id, 'CONCLUIDA', { closedAt: at(6), completedAt: at(6) });
    const cancelled = await sprint(p.id, 'CANCELADA', { closedAt: at(7), completedAt: null });
    const second = await sprint(p.id, 'CONCLUIDA', { closedAt: at(8), completedAt: at(8) });
    const legacy = await sprint(p.id, 'CONCLUIDA', { closedAt: at(9), completedAt: at(9) });
    const foreign = await sprint(other.id, 'EM_ANDAMENTO');
    const one = await task(p.id, first.id, { status: 'CONCLUIDO' });
    const two = await task(p.id, second.id, { status: 'CONCLUIDO' });
    await participation(p.id, first.id, one.id, {
      plannedAtStart: true,
      pointsAtPlanning: 8,
      pointsAtClose: 8,
      exitStatus: 'CONCLUIDO',
      closedAt: at(6)
    });
    await participation(p.id, second.id, two.id, {
      plannedAtStart: true,
      pointsAtPlanning: 12,
      pointsAtClose: 12,
      exitStatus: 'CONCLUIDO',
      closedAt: at(8)
    });
    await participation(p.id, legacy.id, null, {
      plannedAtStart: true,
      pointsAtPlanning: 5,
      pointsAtClose: null,
      exitStatus: 'CONCLUIDO',
      closedAt: at(9)
    });
    const viewer = await actor('VIEWER', p.id);
    const response = await get(p.id, viewer, `?sprintId=${first.id}&limit=1`);
    expect(response.status).toBe(200);
    const i = indicators(response);
    expect(i.I47).toMatchObject({ state: 'PARTIAL', eligibleCount: 2, excludedCount: 1 });
    expect(i.I47.points).toMatchObject([{ sprintId: second.id, completedPoints: 12 }]);
    expect(i.I47.coverage).toMatchObject({ truncatedCount: 1, limit: 1 });
    expect(i.I47.scope).toEqual({ projectId: p.id, cohort: 'COMPLETED_SPRINTS' });
    expect((await get(p.id, owner, `?sprintId=${foreign.id}`)).status).toBe(404);
    expect((await get(p.id, owner, '?limit=51')).status).toBe(400);
    expect((await get(p.id, owner, '?startDate=2026-09-01')).status).toBe(400);
    expect((await get(p.id, null)).status).toBe(401);
    expect((await get(p.id, await actor())).status).toBe(404);
    await prisma.project.update({ where: { id: p.id }, data: { deletedAt: new Date() } });
    expect((await get(p.id, owner)).status).toBe(404);
    expect(cancelled.id).toBeTruthy();
  });
});
