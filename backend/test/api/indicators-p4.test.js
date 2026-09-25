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
const at = (day, hour = 0) =>
  new Date(`2026-09-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00Z`);
const query = '?startDate=2026-09-01&endDate=2026-09-20&timeZone=UTC';

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
      name: `P4 ${n}`,
      username: `p4_${n}`,
      email: `p4_${n}@example.invalid`,
      passwordHash: 'artificial',
      emailVerifiedAt: new Date()
    }
  });
  const token = `p4-session-${n}`;
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
      name: `P4 ${n}`,
      responsibleTeam: 'Equipe artificial',
      accessCode: `P4-${n}`,
      memberships: { create: { userId: owner.id, role: 'OWNER' } }
    }
  });
}

async function task(projectId, data = {}) {
  const n = ++serial;
  return prisma.task.create({
    data: { projectId, title: `P4 Task ${n}`, createdAt: at(1), ...data }
  });
}

async function movement(projectId, taskId, day, fromStatus, toStatus, hour = 0) {
  return prisma.taskMovement.create({
    data: { projectId, taskId, movedAt: at(day, hour), fromStatus, toStatus, movedBy: 'Fixture P4' }
  });
}

function get(projectId, person, suffix = query) {
  const call = request(app).get(`/api/projects/${projectId}/indicators/tasks${suffix}`);
  return person ? call.set('Cookie', `traceflow_session=${person.token}`) : call;
}

function indicators(response) {
  return Object.fromEntries(response.body.indicators.map((item) => [item.metricId, item]));
}

describe('Flow + Task analytics P4 — API', () => {
  it('expõe os 16 indicadores, primeira conclusão, throughput vigente, aging e flow parcial', async () => {
    const owner = await actor();
    const p = await project(owner);
    const done = await task(p.id, { status: 'CONCLUIDO', estimatedEffort: 4, actualEffort: 6 });
    await movement(p.id, done.id, 2, 'A_FAZER', 'EM_ANDAMENTO');
    await movement(p.id, done.id, 3, 'EM_ANDAMENTO', 'CONCLUIDO');
    await movement(p.id, done.id, 5, 'CONCLUIDO', 'EM_ANDAMENTO');
    await movement(p.id, done.id, 6, 'EM_ANDAMENTO', 'CONCLUIDO');
    const wip = await task(p.id, { status: 'EM_ANDAMENTO', deadline: at(10), estimatedEffort: 3 });
    await movement(p.id, wip.id, 2, 'A_FAZER', 'EM_ANDAMENTO');
    await movement(p.id, wip.id, 4, 'EM_ANDAMENTO', 'A_FAZER');
    await movement(p.id, wip.id, 8, 'A_FAZER', 'EM_ANDAMENTO');
    await task(p.id, { status: 'CONCLUIDO' });
    const out = await get(p.id, owner);
    expect(out.status).toBe(200);
    const i = indicators(out);
    expect(Object.keys(i)).toHaveLength(16);
    expect(i.I20).toMatchObject({ value: 2, eligibleCount: 1, excludedCount: 1, state: 'PARTIAL' });
    expect(i.I21).toMatchObject({ value: 1, eligibleCount: 1, excludedCount: 1, state: 'PARTIAL' });
    expect(i.I22).toMatchObject({ value: 1, state: 'PARTIAL', kind: 'SERIES' });
    expect(i.I22.points.find((point) => point.date === '2026-09-06').value).toBe(1);
    expect(i.I23).toMatchObject({ value: 1, period: null });
    expect(i.I24).toMatchObject({ kind: 'LIST', eligibleCount: 1 });
    expect(i.I24.items[0].enteredInProgressAt).toBe(at(8).toISOString());
    expect(i.I25).toMatchObject({ value: null, state: 'PARTIAL', eligibleCount: 2 });
    expect(i.I25.points.find((point) => point.date === '2026-09-08')).toMatchObject({
      todo: 0,
      inProgress: 1,
      done: 1
    });
    expect(i.I25.limitations).toContain('HARD_DELETED_TASK_HISTORY_NOT_RECOVERABLE');
    expect(i.I26.value).toBe(3);
    expect(i.I27.value).toEqual({ A_FAZER: 0, EM_ANDAMENTO: 1, CONCLUIDO: 2 });
    expect(i.I28).toMatchObject({ value: 1, kind: 'LIST' });
    expect(i.I29.value).toBe(3);
    expect(i.I30.value).toBe(1);
    expect(i.I31).toMatchObject({ value: 7, state: 'PARTIAL' });
    expect(i.I32).toMatchObject({ value: 6, state: 'PARTIAL' });
    expect(i.I33.value).toBe(2);
    expect(i.I34).toMatchObject({ value: 1, kind: 'LIST' });
    expect(i.I35).toMatchObject({ value: 0, kind: 'LIST' });
    expect(JSON.stringify(out.body)).not.toContain('passwordHash');
  });

  it('preserva zero explícito, não soma sessões duas vezes e só inclui concluída abaixo da estimativa', async () => {
    const owner = await actor();
    const p = await project(owner);
    const completed = await task(p.id, {
      status: 'CONCLUIDO',
      estimatedEffort: 4,
      actualEffort: 1
    });
    await prisma.taskTimeEntry.create({
      data: {
        projectId: p.id,
        taskId: completed.id,
        startedById: owner.id,
        endedById: owner.id,
        startedAt: at(2),
        endedAt: at(2, 1),
        durationSeconds: 3600
      }
    });
    await task(p.id, { status: 'EM_ANDAMENTO', estimatedEffort: 4, actualEffort: 0 });
    await task(p.id, { estimatedEffort: 0, actualEffort: null });
    const i = indicators(await get(p.id, owner));
    expect(i.I30.value).toBe(0);
    expect(i.I31.value).toBe(8);
    expect(i.I32.value).toBe(1);
    expect(i.I33.value).toBe(-7);
    expect(i.I34.value).toBe(0);
    expect(i.I35.value).toBe(1);
    expect(i.I35.items.map((item) => item.taskId)).toEqual([completed.id]);
  });

  it('isola projeto, valida intervalo/filtros e controla acesso', async () => {
    const owner = await actor();
    const p = await project(owner);
    const other = await project(owner);
    await task(p.id);
    await task(other.id);
    await task(other.id);
    const viewer = await actor('VIEWER', p.id);
    const outsider = await actor();
    expect(indicators(await get(p.id, viewer)).I26.value).toBe(1);
    expect((await get(p.id, outsider)).status).toBe(404);
    expect((await get(p.id, null)).status).toBe(401);
    expect((await get(999999, owner)).status).toBe(404);
    expect((await get(p.id, owner, `${query}&responsibleUserId=${owner.id}`)).status).toBe(400);
    expect(
      (await get(p.id, owner, '?startDate=2025-01-01&endDate=2026-09-20&timeZone=UTC')).status
    ).toBe(400);
    expect(
      (await get(p.id, owner, '?startDate=2026-09-20&endDate=2026-09-01&timeZone=UTC')).status
    ).toBe(400);
    const futureDay = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const future = indicators(
      await get(p.id, owner, `?startDate=${futureDay}&endDate=${futureDay}&timeZone=UTC`)
    );
    expect(future.I20.state).toBe('PARTIAL');
    expect(future.I22).toMatchObject({ value: 0, state: 'PARTIAL' });
    expect(future.I22.limitations).toContain('PERIOD_NOT_COMPLETE');
    await prisma.project.update({ where: { id: p.id }, data: { deletedAt: new Date() } });
    expect((await get(p.id, owner)).status).toBe(404);
  });

  it('usa limites civis da timezone solicitada e não inventa série cumulativa sem cadeia', async () => {
    const owner = await actor();
    const p = await project(owner);
    const t = await task(p.id, { status: 'CONCLUIDO' });
    await movement(p.id, t.id, 2, 'A_FAZER', 'CONCLUIDO', 3);
    const out = await get(
      p.id,
      owner,
      '?startDate=2026-09-01&endDate=2026-09-01&timeZone=America/Sao_Paulo'
    );
    expect(out.status).toBe(200);
    expect(out.body.period).toMatchObject({
      startInclusive: '2026-09-01T03:00:00.000Z',
      endExclusive: '2026-09-02T03:00:00.000Z'
    });
    const i = indicators(out);
    expect(i.I20.state).toBe('NO_DATA');
    expect(i.I22.value).toBe(0);
    await prisma.taskMovement.deleteMany({ where: { projectId: p.id } });
    const empty = indicators(await get(p.id, owner));
    expect(empty.I25).toMatchObject({ value: null, state: 'UNAVAILABLE', eligibleCount: 0 });
    expect(empty.I25.points).toEqual([]);
  });
});
