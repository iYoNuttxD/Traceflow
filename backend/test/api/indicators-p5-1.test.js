import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startTestServer } from '../helpers/http-server.js';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

let app;
let prisma;
let serial = 0;
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

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

async function setup() {
  const n = ++serial;
  const agent = request.agent(app);
  const registered = await agent.post('/api/auth/register').send({
    name: `Burnup ${n}`,
    username: `burnup${n}`,
    email: `burnup${n}@example.invalid`,
    password: 'SenhaSegura123'
  });
  expect(registered.status).toBe(201);
  await request(app)
    .post('/api/auth/email-verification/verify')
    .send({ token: registered.body.emailVerification.testToken });
  const csrf = registered.body.csrfToken;
  const mutate = (method, path) => agent[method](path).set('X-CSRF-Token', csrf);
  const created = await mutate('post', '/api/projects').send({
    name: `Burnup ${n}`,
    responsibleTeam: 'Equipe'
  });
  expect(created.status).toBe(201);
  const projectId = created.body.project.id;
  const createSprint = async (name = 'Sprint Burnup') => {
    const response = await mutate('post', `/api/projects/${projectId}/sprints`).send({
      name,
      startDate: day(-1),
      endDate: day(7)
    });
    expect(response.status).toBe(201);
    return response.body.sprint;
  };
  const createTask = async (title, estimatedEffort) => {
    const response = await mutate('post', `/api/projects/${projectId}/tasks`).send({
      title,
      estimatedEffort
    });
    expect(response.status).toBe(201);
    return response.body.task;
  };
  const series = async (sprintId) => {
    const response = await agent.get(
      `/api/projects/${projectId}/indicators/sprints?sprintId=${sprintId}`
    );
    expect(response.status).toBe(200);
    const find = (id) => response.body.indicators.find((item) => item.metricId === id);
    return { burndown: find('I45'), burnup: find('I46') };
  };
  const burnup = async (sprintId) => (await series(sprintId)).burnup;
  return { agent, mutate, projectId, createSprint, createTask, burnup, series };
}

function expectComparable({ burndown, burnup }) {
  expect(burndown.definitionVersion).toBe(2);
  expect(burndown.points.map((row) => row.date)).toEqual(burnup.points.map((row) => row.date));
  for (let index = 0; index < burnup.points.length; index += 1) {
    const up = burnup.points[index];
    const down = burndown.points[index];
    if (up.scope === null) {
      expect(down.remaining).toBeNull();
      continue;
    }
    expect(up.scope).toBeGreaterThanOrEqual(0);
    expect(up.completed).toBeGreaterThanOrEqual(0);
    expect(down.remaining).toBeGreaterThanOrEqual(0);
    expect(up.completed).toBeLessThanOrEqual(up.scope);
    expect(up.scope - up.completed).toBeCloseTo(down.remaining, 9);
  }
}

describe('Sprint Burnup P5.1 — persisted API', () => {
  it('keeps missing estimates unknown through start, aggregate and terminal snapshots', async () => {
    const s = await setup();
    const sprint = await s.createSprint();
    const first = await s.createTask('Conhecida', 4);
    const missing = await s.createTask('Desconhecida', null);
    for (const task of [first, missing])
      await s.mutate('patch', `/api/tasks/${task.id}/sprint`).send({ sprintId: sprint.id });
    expect(
      (await s.mutate('patch', `/api/sprints/${sprint.id}/status`).send({ status: 'EM_ANDAMENTO' }))
        .status
    ).toBe(200);
    const read = async () => {
      const response = await s.agent.get(
        `/api/projects/${s.projectId}/indicators/sprints?sprintId=${sprint.id}`
      );
      expect(response.status).toBe(200);
      return Object.fromEntries(response.body.indicators.map((item) => [item.metricId, item]));
    };
    const active = await read();
    for (const id of ['I36', 'I37'])
      expect(active[id]).toMatchObject({
        value: 4,
        state: 'PARTIAL',
        coverage: { unknownEstimateCount: 1 }
      });
    expect(active.I44).toMatchObject({ state: 'PARTIAL', components: { incomplete: true } });
    expect(active.I45).toMatchObject({
      state: 'PARTIAL',
      coverage: { totalPoints: null, chartMax: 0 }
    });
    expect(active.I45.limitations).not.toContain('SPRINT_NOT_STARTED');
    const progress = await s.agent.get(`/api/sprints/${sprint.id}/progress`);
    expect(progress.status).toBe(200);
    expect(progress.body.burndown).toMatchObject({
      hasData: false,
      totalPoints: null,
      chartMax: 0
    });
    expect(JSON.stringify(progress.body)).not.toMatch(/NaN|Infinity/);
    const planning = await prisma.sprintTask.findFirst({
      where: { sprintId: sprint.id, taskId: missing.id }
    });
    expect(planning.pointsAtPlanning).toBeNull();
    expect(
      (await s.mutate('patch', `/api/sprints/${sprint.id}/status`).send({ status: 'CONCLUIDA' }))
        .status
    ).toBe(200);
    const closed = await read();
    expect(closed.I37).toMatchObject({ value: 4, state: 'PARTIAL' });
    expect(closed.I47).toMatchObject({ points: [], excludedCount: 1 });
    const frozen = await prisma.sprintTask.findFirst({
      where: { sprintId: sprint.id, taskId: missing.id }
    });
    expect(frozen).toMatchObject({
      pointsAtClose: null,
      closingTaskSnapshot: { version: 4, estimatedEffort: null, outgoingCarryOver: null }
    });
    await s.mutate('put', `/api/tasks/${missing.id}`).send({ estimatedEffort: 8 });
    expect((await read()).I37.value).toBe(4);
  });

  it.each(['add', 'remove'])(
    'preserves initial ideal and historical scale after scope %s',
    async (mode) => {
      const s = await setup();
      const sprint = await s.createSprint();
      const first = await s.createTask('Primeira 20h', 20);
      const second = await s.createTask('Segunda 20h', 20);
      await s.mutate('patch', `/api/tasks/${first.id}/sprint`).send({ sprintId: sprint.id });
      if (mode === 'remove')
        await s.mutate('patch', `/api/tasks/${second.id}/sprint`).send({ sprintId: sprint.id });
      await s.mutate('patch', `/api/sprints/${sprint.id}/status`).send({ status: 'EM_ANDAMENTO' });
      if (mode === 'add')
        await s.mutate('patch', `/api/tasks/${second.id}/sprint`).send({ sprintId: sprint.id });
      else await s.mutate('delete', `/api/tasks/${second.id}/sprint`);
      // Controlled dates in the isolated test DB; values and event types come from the real domain.
      const baselineAt = new Date(`${day(-1)}T00:00:00Z`);
      await prisma.sprint.update({
        where: { id: sprint.id },
        data: {
          startedAt: baselineAt,
          planningSnapshotAt: baselineAt,
          burnupCoverageStartedAt: baselineAt
        }
      });
      await prisma.sprintBurnupEvent.updateMany({
        where: { sprintId: sprint.id, type: 'BASELINE_TASK' },
        data: { occurredAt: baselineAt }
      });
      const result = await s.series(sprint.id);
      expectComparable(result);
      expect(result.burndown.coverage).toMatchObject({
        totalPoints: mode === 'add' ? 20 : 40,
        chartMax: 40
      });
      expect(result.burndown.points[0]).toMatchObject({
        ideal: mode === 'add' ? 20 : 40,
        remaining: mode === 'add' ? 20 : 40
      });
      expect(result.burndown.points[1].remaining).toBe(mode === 'add' ? 40 : 20);
      expect(result.burndown.points.at(-1).ideal).toBe(0);
    }
  );

  it('captures baseline, estimate, completion, reopening and scope reentry atomically', async () => {
    const s = await setup();
    const sprint = await s.createSprint();
    const first = await s.createTask('Primeira', 3);
    const second = await s.createTask('Segunda', 2);
    for (const task of [first, second]) {
      expect(
        (await s.mutate('patch', `/api/tasks/${task.id}/sprint`).send({ sprintId: sprint.id }))
          .status
      ).toBe(200);
    }
    expect(
      (await s.mutate('patch', `/api/sprints/${sprint.id}/status`).send({ status: 'EM_ANDAMENTO' }))
        .status
    ).toBe(200);
    const baseline = await s.burnup(sprint.id);
    expect(baseline).toMatchObject({
      state: 'AVAILABLE',
      definitionVersion: 2,
      coverage: { complete: true },
      limitations: []
    });
    expect(baseline.points[0]).toMatchObject({ scope: 5, completed: 0 });

    expect(
      (await s.mutate('put', `/api/tasks/${first.id}`).send({ estimatedEffort: 5 })).status
    ).toBe(200);
    expect(
      (await s.mutate('patch', `/api/tasks/${first.id}/status`).send({ status: 'CONCLUIDO' }))
        .status
    ).toBe(200);
    expect(
      (await s.mutate('patch', `/api/tasks/${first.id}/status`).send({ status: 'EM_ANDAMENTO' }))
        .status
    ).toBe(200);
    expect(
      (await s.mutate('patch', `/api/tasks/${first.id}/status`).send({ status: 'CONCLUIDO' }))
        .status
    ).toBe(200);
    expect((await s.mutate('delete', `/api/tasks/${second.id}/sprint`)).status).toBe(200);
    expect(
      (await s.mutate('patch', `/api/tasks/${second.id}/sprint`).send({ sprintId: sprint.id }))
        .status
    ).toBe(200);
    const result = await s.burnup(sprint.id);
    expect(result).toMatchObject({ state: 'AVAILABLE', coverage: { complete: true } });
    expect(result.points[0]).toMatchObject({ scope: 7, completed: 5 });
    expectComparable(await s.series(sprint.id));
    const dashboard = await s.agent.get(
      `/api/projects/${s.projectId}/indicators/dashboard?view=SPRINT&sprintId=${sprint.id}`
    );
    expect(dashboard.status).toBe(200);
    const displayedBurnup = dashboard.body.sections
      .flatMap((section) => section.indicators)
      .find((indicator) => indicator.metricId === 'I46');
    expect(displayedBurnup).toMatchObject({
      state: 'AVAILABLE',
      definitionVersion: 2,
      points: result.points,
      coverage: { complete: true },
      appliedFilters: { sprint: true }
    });
    const events = await prisma.sprintBurnupEvent.findMany({
      where: { sprintId: sprint.id },
      orderBy: { id: 'asc' }
    });
    expect(events.map((row) => row.type)).toEqual([
      'BASELINE_TASK',
      'BASELINE_TASK',
      'ESTIMATE_CHANGED',
      'STATUS_CHANGED',
      'STATUS_CHANGED',
      'STATUS_CHANGED',
      'TASK_REMOVED',
      'TASK_ADDED'
    ]);
    expect(events[2]).toMatchObject({ previousPoints: 3, newPoints: 5 });
  });

  it('keeps a terminal Burnup byte-for-byte stable after Task edits and physical deletion', async () => {
    const s = await setup();
    const sprint = await s.createSprint();
    const task = await s.createTask('Histórica', 4);
    await s.mutate('patch', `/api/tasks/${task.id}/sprint`).send({ sprintId: sprint.id });
    await s.mutate('patch', `/api/sprints/${sprint.id}/status`).send({ status: 'EM_ANDAMENTO' });
    await s.mutate('patch', `/api/tasks/${task.id}/status`).send({ status: 'CONCLUIDO' });
    expect(
      (await s.mutate('patch', `/api/sprints/${sprint.id}/status`).send({ status: 'CONCLUIDA' }))
        .status
    ).toBe(200);
    const before = await s.series(sprint.id);
    expect(before.burnup.state).toBe('AVAILABLE');
    expectComparable(before);
    const eventCount = await prisma.sprintBurnupEvent.count({ where: { sprintId: sprint.id } });
    await s.mutate('put', `/api/tasks/${task.id}`).send({ estimatedEffort: 9 });
    expect(
      (await s.mutate('patch', `/api/tasks/${task.id}/status`).send({ status: 'EM_ANDAMENTO' }))
        .status
    ).toBe(409);
    await prisma.task.update({
      where: { id: task.id },
      data: { status: 'EM_ANDAMENTO', actualEffort: 7 }
    });
    expect((await s.mutate('delete', `/api/tasks/${task.id}`)).status).toBe(200);
    const after = await s.series(sprint.id);
    expect(after.burnup.points).toEqual(before.burnup.points);
    expect(after.burnup.coverage).toEqual(before.burnup.coverage);
    expect(after.burnup.state).toBe(before.burnup.state);
    expect(after.burndown.points).toEqual(before.burndown.points);
    expect(after.burndown.coverage).toEqual(before.burndown.coverage);
    expect(after.burndown.state).toBe(before.burndown.state);
    expect(await prisma.sprintBurnupEvent.count({ where: { sprintId: sprint.id } })).toBe(
      eventCount
    );
    expect(await prisma.taskMovement.count({ where: { taskId: task.id } })).toBe(0);
  });

  it('does not invent old history and exposes an explicit partial anchor', async () => {
    const s = await setup();
    const old = await s.createSprint();
    const t = await s.createTask('Legacy', 5);
    await prisma.sprint.update({
      where: { id: old.id },
      data: {
        status: 'EM_ANDAMENTO',
        startedAt: new Date(Date.now() - 2 * 86400000),
        planningSnapshotAt: new Date(Date.now() - 2 * 86400000)
      }
    });
    expect(await s.burnup(old.id)).toMatchObject({ state: 'UNAVAILABLE', points: [] });
    const capturedAt = new Date();
    await prisma.sprint.update({
      where: { id: old.id },
      data: { burnupCoverageStartedAt: capturedAt }
    });
    await prisma.sprintBurnupEvent.create({
      data: {
        projectId: s.projectId,
        sprintId: old.id,
        taskKey: t.id,
        type: 'BASELINE_TASK',
        newPoints: 5,
        toStatus: 'A_FAZER',
        occurredAt: capturedAt
      }
    });
    const partial = await s.burnup(old.id);
    expect(partial).toMatchObject({
      state: 'PARTIAL',
      coverage: { complete: false, startedAt: capturedAt.toISOString() }
    });
    expect(partial.points[0].date).toBe(day(0));
    expect(partial.limitations).toContain('BURNUP_COVERAGE_STARTED_MID_SPRINT');
    const partialSeries = await s.series(old.id);
    expect(partialSeries.burndown.state).toBe('PARTIAL');
    expectComparable(partialSeries);
  });

  it('preserves an origin Sprint through transfer and later estimate changes in the destination', async () => {
    const s = await setup();
    const origin = await s.createSprint('Origem');
    const destinationResponse = await s
      .mutate('post', `/api/projects/${s.projectId}/sprints`)
      .send({ name: 'Destino', startDate: day(7), endDate: day(14) });
    expect(destinationResponse.status).toBe(201);
    const destination = destinationResponse.body.sprint;
    const task = await s.createTask('Transferida', 3);
    await s.mutate('patch', `/api/tasks/${task.id}/sprint`).send({ sprintId: origin.id });
    await s.mutate('patch', `/api/sprints/${origin.id}/status`).send({ status: 'EM_ANDAMENTO' });
    await s.mutate('delete', `/api/tasks/${task.id}/sprint`);
    const before = await s.series(origin.id);
    expect(before.burnup.state).toBe('AVAILABLE');
    expect(before.burnup.points[0]).toMatchObject({ scope: 0, completed: 0 });
    expectComparable(before);
    expect(
      (await s.mutate('patch', `/api/sprints/${origin.id}/status`).send({ status: 'CONCLUIDA' }))
        .status
    ).toBe(200);
    await s.mutate('patch', `/api/tasks/${task.id}/sprint`).send({ sprintId: destination.id });
    expect(
      (
        await s
          .mutate('patch', `/api/sprints/${destination.id}/status`)
          .send({ status: 'EM_ANDAMENTO' })
      ).status
    ).toBe(200);
    await s.mutate('put', `/api/tasks/${task.id}`).send({ estimatedEffort: 5 });
    const originAfter = await s.series(origin.id);
    const destinationAfter = await s.series(destination.id);
    expect(originAfter.burnup.points).toEqual(before.burnup.points);
    expect(originAfter.burndown.points).toEqual(before.burndown.points);
    expect(destinationAfter.burnup).toMatchObject({ state: 'AVAILABLE' });
    expect(destinationAfter.burnup.points[0]).toMatchObject({ scope: 5, completed: 0 });
    expectComparable(destinationAfter);
    expect(
      await prisma.sprintBurnupEvent.findMany({
        where: { taskKey: task.id, type: 'ESTIMATE_CHANGED' },
        select: { sprintId: true }
      })
    ).toEqual([{ sprintId: destination.id }]);
  });

  it('keeps the removal fact after deleting a Task from an active Sprint', async () => {
    const s = await setup();
    const sprint = await s.createSprint();
    const task = await s.createTask('Removida por exclusão', 4);
    await s.mutate('patch', `/api/tasks/${task.id}/sprint`).send({ sprintId: sprint.id });
    await s.mutate('patch', `/api/sprints/${sprint.id}/status`).send({ status: 'EM_ANDAMENTO' });
    expect((await s.mutate('delete', `/api/tasks/${task.id}`)).status).toBe(200);
    const result = await s.burnup(sprint.id);
    expect(result.state).toBe('AVAILABLE');
    expect(result.points[0]).toMatchObject({ scope: 0, completed: 0 });
    expectComparable(await s.series(sprint.id));
    const event = await prisma.sprintBurnupEvent.findFirst({
      where: { sprintId: sprint.id, taskKey: task.id, type: 'TASK_REMOVED' }
    });
    expect(event).toMatchObject({ previousPoints: 4 });
  });
});
