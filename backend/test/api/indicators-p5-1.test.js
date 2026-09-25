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
  const burnup = async (sprintId) => {
    const response = await agent.get(
      `/api/projects/${projectId}/indicators/sprints?sprintId=${sprintId}`
    );
    expect(response.status).toBe(200);
    return response.body.indicators.find((item) => item.metricId === 'I46');
  };
  return { agent, mutate, projectId, createSprint, createTask, burnup };
}

describe('Sprint Burnup P5.1 — persisted API', () => {
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
    const before = await s.burnup(sprint.id);
    expect(before.state).toBe('AVAILABLE');
    const eventCount = await prisma.sprintBurnupEvent.count({ where: { sprintId: sprint.id } });
    await s.mutate('put', `/api/tasks/${task.id}`).send({ estimatedEffort: 9 });
    await prisma.task.update({ where: { id: task.id }, data: { actualEffort: 7 } });
    expect((await s.mutate('delete', `/api/tasks/${task.id}`)).status).toBe(200);
    const after = await s.burnup(sprint.id);
    expect(after.points).toEqual(before.points);
    expect(after.coverage).toEqual(before.coverage);
    expect(after.state).toBe(before.state);
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
    const before = await s.burnup(origin.id);
    expect(before.state).toBe('AVAILABLE');
    expect(before.points[0]).toMatchObject({ scope: 0, completed: 0 });
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
    const originAfter = await s.burnup(origin.id);
    const destinationAfter = await s.burnup(destination.id);
    expect(originAfter.points).toEqual(before.points);
    expect(destinationAfter).toMatchObject({ state: 'AVAILABLE' });
    expect(destinationAfter.points[0]).toMatchObject({ scope: 5, completed: 0 });
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
    const event = await prisma.sprintBurnupEvent.findFirst({
      where: { sprintId: sprint.id, taskKey: task.id, type: 'TASK_REMOVED' }
    });
    expect(event).toMatchObject({ previousPoints: 4 });
  });
});
