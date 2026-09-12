import { writeFileSync } from 'node:fs';
import { startTestServer } from '../helpers/http-server.js';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createProject, createTask } from '../fixtures/factories.js';

let app;
let prisma;
const password = 'SenhaSegura123';

beforeAll(async () => {
  const url = configureTestDatabaseEnvironment();
  deployTestMigrations(url);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ default: app } = await import('../../src/app.js'));
  app = await startTestServer(app);
  await cleanTestDatabase(prisma);
});
afterEach(async () => cleanTestDatabase(prisma));
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function register(email, role, projectId) {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name: `Pessoa ${email.split('@')[0]}`,
    username: `u${email
      .split('@')[0]
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 29)}`,
    email,
    password
  });
  await request(app)
    .post('/api/auth/email-verification/verify')
    .send({ token: response.body.emailVerification.testToken });
  if (projectId) {
    await prisma.projectMembership.create({
      data: { projectId, userId: response.body.user.id, role }
    });
  }
  return {
    agent,
    user: response.body.user,
    mutate: (method, path) => agent[method](path).set('X-CSRF-Token', response.body.csrfToken)
  };
}

const entriesPath = (taskId) => `/api/tasks/${taskId}/time-entries`;

describe('S1-06 — esforço realizado por sessões de tempo (RF32/RF33/RF34)', () => {
  it('inicia com o ator da sessão, impede sessão dupla e registra quem parou', async () => {
    const project = await createProject(prisma);
    const ana = await register('s106-ana@example.invalid', 'MEMBER', project.id);
    const bruno = await register('s106-bruno@example.invalid', 'MEMBER', project.id);
    const task = await createTask(prisma, project.id, { estimatedEffort: 8 });

    const started = await ana.mutate('post', `${entriesPath(task.id)}/start`).send({});
    expect(started).toMatchObject({
      status: 201,
      body: {
        message: 'Cronômetro iniciado.',
        entry: {
          taskId: task.id,
          source: 'TIMER',
          endedAt: null,
          startedBy: { id: ana.user.id },
          endedBy: null,
          canDelete: true
        },
        effort: {
          unit: 'HOURS',
          estimatedHours: 8,
          completedSeconds: 0,
          status: 'DENTRO_DO_PREVISTO',
          running: { id: started.body?.entry?.id, startedBy: { id: ana.user.id } }
        }
      }
    });

    const again = await bruno.mutate('post', `${entriesPath(task.id)}/start`).send({});
    expect(again.status).toBe(409);

    const listedWhileRunning = await bruno.agent.get(entriesPath(task.id));
    expect(listedWhileRunning.body).toMatchObject({
      running: { id: started.body.entry.id, startedBy: { id: ana.user.id }, canDelete: false },
      entries: [],
      permissions: { canOperate: true, canModerate: false }
    });

    const stopped = await bruno.mutate('post', `${entriesPath(task.id)}/stop`).send({});
    expect(stopped).toMatchObject({
      status: 200,
      body: {
        message: 'Cronômetro parado.',
        entry: {
          id: started.body.entry.id,
          startedBy: { id: ana.user.id },
          endedBy: { id: bruno.user.id }
        },
        effort: { running: null, completedCount: 1 }
      }
    });
    expect(stopped.body.entry.durationSeconds).toBeGreaterThanOrEqual(0);
    expect(typeof stopped.body.effort.actualHours).toBe('number');

    expect((await ana.mutate('post', `${entriesPath(task.id)}/stop`).send({})).status).toBe(409);

    const detail = await ana.agent.get(`/api/tasks/${task.id}`);
    expect(typeof detail.body.task.actualEffort).toBe('number');

    const listed = await ana.agent.get(entriesPath(task.id));
    expect(listed.body.running).toBeNull();
    expect(listed.body.entries).toHaveLength(1);
    expect(listed.body.entries[0]).toMatchObject({
      startedBy: { id: ana.user.id },
      endedBy: { id: bruno.user.id },
      canDelete: true
    });

    const audits = await prisma.auditEvent.findMany({
      where: { resourceType: 'TaskTimeEntry', resourceId: String(started.body.entry.id) },
      orderBy: { id: 'asc' }
    });
    expect(audits.map((audit) => [audit.action, audit.actorUserId])).toEqual([
      ['TASK_TIMER_STARTED', ana.user.id],
      ['TASK_TIMER_STOPPED', bruno.user.id]
    ]);
    expect(audits[1].metadataJson).toMatchObject({ taskId: task.id, source: 'TIMER' });
  });

  it('serializa inícios concorrentes: exatamente uma sessão abre', async () => {
    const project = await createProject(prisma);
    const ana = await register('s106-conc-a@example.invalid', 'MEMBER', project.id);
    const bruno = await register('s106-conc-b@example.invalid', 'MEMBER', project.id);
    const task = await createTask(prisma, project.id);

    const responses = await Promise.all([
      ana.mutate('post', `${entriesPath(task.id)}/start`).send({}),
      bruno.mutate('post', `${entriesPath(task.id)}/start`).send({})
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await prisma.taskTimeEntry.count({ where: { taskId: task.id, endedAt: null } })).toBe(1);
  });

  it('lançamento manual soma em horas decimais, valida entrada e bloqueia escrita direta do realizado', async () => {
    const project = await createProject(prisma);
    const member = await register('s106-manual@example.invalid', 'MEMBER', project.id);
    const task = await createTask(prisma, project.id, { estimatedEffort: 4 });

    const created = await member
      .mutate('post', entriesPath(task.id))
      .send({ hours: '1,5', note: 'Esqueci de iniciar o cronômetro.' });
    expect(created).toMatchObject({
      status: 201,
      body: {
        message: 'Lançamento manual registrado.',
        entry: {
          source: 'MANUAL',
          durationSeconds: 5400,
          note: 'Esqueci de iniciar o cronômetro.',
          startedBy: { id: member.user.id },
          endedBy: { id: member.user.id }
        },
        effort: { actualHours: 1.5, usagePercent: 37.5, status: 'DENTRO_DO_PREVISTO' }
      }
    });
    const persisted = await prisma.task.findUnique({ where: { id: task.id } });
    expect(persisted.actualEffort).toBe(1.5);

    for (const body of [{ hours: 0 }, { hours: -2 }, { hours: 25 }, { hours: 'x' }, {}]) {
      expect((await member.mutate('post', entriesPath(task.id)).send(body)).status).toBe(400);
    }

    const direct = await member.mutate('put', `/api/tasks/${task.id}`).send({ actualEffort: 3 });
    expect(direct.status).toBe(400);
    expect(direct.body.message).toContain('sessões de tempo');
    expect((await prisma.task.findUnique({ where: { id: task.id } })).actualEffort).toBe(1.5);
  });

  it('classifica estouro, ausência de estimativa e estimativa zero conforme as fórmulas', async () => {
    const project = await createProject(prisma);
    const member = await register('s106-limits@example.invalid', 'MEMBER', project.id);
    const limited = await createTask(prisma, project.id, { estimatedEffort: 1 });
    const unbounded = await createTask(prisma, project.id);
    const zero = await createTask(prisma, project.id, { estimatedEffort: 0 });

    const over = await member.mutate('post', entriesPath(limited.id)).send({ hours: 1.5 });
    expect(over.body.effort).toMatchObject({
      status: 'ESTOURADO',
      overrunSeconds: 1800,
      remainingSeconds: 0,
      usagePercent: 150,
      differenceHours: 0.5,
      differencePercent: 50
    });

    const open = await member.mutate('post', entriesPath(unbounded.id)).send({ hours: 2 });
    expect(open.body.effort).toMatchObject({
      status: 'SEM_ESTIMATIVA',
      estimatedHours: null,
      usagePercent: null,
      overrunSeconds: null,
      actualHours: 2
    });

    const zeroed = await member.mutate('post', entriesPath(zero.id)).send({ hours: 0.1 });
    expect(zeroed.body.effort).toMatchObject({
      status: 'ESTOURADO',
      estimatedHours: 0,
      usagePercent: null,
      differencePercent: null,
      overrunSeconds: 360
    });
  });

  it('VIEWER só lê; membro exclui só a própria sessão; MANAGER modera e o realizado é recalculado', async () => {
    const project = await createProject(prisma);
    const author = await register('s106-author@example.invalid', 'MEMBER', project.id);
    const colleague = await register('s106-colleague@example.invalid', 'MEMBER', project.id);
    const viewer = await register('s106-viewer@example.invalid', 'VIEWER', project.id);
    const manager = await register('s106-manager@example.invalid', 'MANAGER', project.id);
    const task = await createTask(prisma, project.id, { estimatedEffort: 3 });

    expect((await viewer.mutate('post', `${entriesPath(task.id)}/start`).send({})).status).toBe(
      403
    );
    expect((await viewer.mutate('post', entriesPath(task.id)).send({ hours: 1 })).status).toBe(403);

    const first = await author.mutate('post', entriesPath(task.id)).send({ hours: 1 });
    const second = await author.mutate('post', entriesPath(task.id)).send({ hours: 0.5 });
    expect((await prisma.task.findUnique({ where: { id: task.id } })).actualEffort).toBe(1.5);

    const asViewer = await viewer.agent.get(entriesPath(task.id));
    expect(asViewer.status).toBe(200);
    expect(asViewer.body.permissions).toEqual({ canOperate: false, canModerate: false });
    expect(asViewer.body.entries.every((entry) => entry.canDelete === false)).toBe(true);

    expect(
      (await colleague.mutate('delete', `${entriesPath(task.id)}/${first.body.entry.id}`)).status
    ).toBe(403);
    expect(
      (await viewer.mutate('delete', `${entriesPath(task.id)}/${first.body.entry.id}`)).status
    ).toBe(403);

    const ownDeletion = await author.mutate(
      'delete',
      `${entriesPath(task.id)}/${first.body.entry.id}`
    );
    expect(ownDeletion.status).toBe(200);
    expect(ownDeletion.body.effort).toMatchObject({ actualHours: 0.5, completedCount: 1 });

    const moderation = await manager.mutate(
      'delete',
      `${entriesPath(task.id)}/${second.body.entry.id}`
    );
    expect(moderation.status).toBe(200);
    expect(moderation.body.effort).toMatchObject({ actualHours: 0, completedCount: 0 });
    expect((await prisma.task.findUnique({ where: { id: task.id } })).actualEffort).toBeNull();
    expect(
      (await manager.mutate('delete', `${entriesPath(task.id)}/${second.body.entry.id}`)).status
    ).toBe(404);

    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'TASK_TIME_ENTRY_DELETED', actorUserId: manager.user.id }
    });
    expect(audit).toMatchObject({
      resourceType: 'TaskTimeEntry',
      resourceId: String(second.body.entry.id),
      metadataJson: { taskId: task.id, source: 'MANUAL', durationSeconds: 1800 }
    });

    await author.mutate('post', `${entriesPath(task.id)}/start`).send({});
    expect((await author.mutate('delete', `/api/tasks/${task.id}`)).status).toBe(200);
    expect(await prisma.taskTimeEntry.count({ where: { taskId: task.id } })).toBe(0);
  });

  it('aceita estimativa em passos de meia hora e recusa outras frações', async () => {
    const project = await createProject(prisma);
    const member = await register('s106-half@example.invalid', 'MEMBER', project.id);
    const task = await createTask(prisma, project.id);

    const updated = await member
      .mutate('put', `/api/tasks/${task.id}`)
      .send({ estimatedEffort: '1,5' });
    expect(updated.status).toBe(200);
    expect(updated.body.task.estimatedEffort).toBe(1.5);

    for (const estimatedEffort of [1.25, -0.5, 'abc', '2.7']) {
      const rejected = await member
        .mutate('put', `/api/tasks/${task.id}`)
        .send({ estimatedEffort });
      expect(rejected.status).toBe(400);
    }
    expect((await prisma.task.findUnique({ where: { id: task.id } })).estimatedEffort).toBe(1.5);

    const created = await member.mutate('post', entriesPath(task.id)).send({ hours: 0.75 });
    expect(created.body.effort).toMatchObject({
      estimatedHours: 1.5,
      usagePercent: 50,
      status: 'DENTRO_DO_PREVISTO'
    });
  });

  it('pagina e filtra o histórico por período e origem, e expõe a sessão aberta no DTO da tarefa', async () => {
    const project = await createProject(prisma);
    const member = await register('s106-page@example.invalid', 'MEMBER', project.id);
    const task = await createTask(prisma, project.id, { estimatedEffort: 10 });

    for (const occurredAt of ['2026-09-01', '2026-09-02', '2026-09-03']) {
      expect(
        (await member.mutate('post', entriesPath(task.id)).send({ hours: 1, occurredAt })).status
      ).toBe(201);
    }
    await member.mutate('post', `${entriesPath(task.id)}/start`).send({});
    await member.mutate('post', `${entriesPath(task.id)}/stop`).send({});

    const firstPage = await member.agent.get(`${entriesPath(task.id)}?page=1&limit=2`);
    expect(firstPage.body.pagination).toEqual({ page: 1, limit: 2, total: 4, totalPages: 2 });
    expect(firstPage.body.entries).toHaveLength(2);
    expect(firstPage.body.effort.completedCount).toBe(4);
    const secondPage = await member.agent.get(`${entriesPath(task.id)}?page=2&limit=2`);
    expect(secondPage.body.entries).toHaveLength(2);
    const ids = [...firstPage.body.entries, ...secondPage.body.entries].map(({ id }) => id);
    expect(new Set(ids).size).toBe(4);

    const manualOnly = await member.agent.get(`${entriesPath(task.id)}?source=MANUAL&limit=10`);
    expect(manualOnly.body.pagination.total).toBe(3);
    expect(manualOnly.body.entries.every(({ source }) => source === 'MANUAL')).toBe(true);
    // O resumo não segue o filtro: continua sendo o total da tarefa.
    expect(manualOnly.body.effort.completedCount).toBe(4);

    const byPeriod = await member.agent.get(
      `${entriesPath(task.id)}?startDate=2026-09-02&endDate=2026-09-02&limit=10`
    );
    expect(byPeriod.body.pagination.total).toBe(1);
    expect(byPeriod.body.entries[0].endedAt.slice(0, 10)).toBe('2026-09-02');

    expect(
      (await member.agent.get(`${entriesPath(task.id)}?startDate=2026-09-05&endDate=2026-09-01`))
        .status
    ).toBe(400);
    expect((await member.agent.get(`${entriesPath(task.id)}?source=OUTRA`)).status).toBe(400);

    const started = await member.mutate('post', `${entriesPath(task.id)}/start`).send({});
    const detail = await member.agent.get(`/api/tasks/${task.id}`);
    expect(detail.body.task.runningTimer).toMatchObject({
      id: started.body.entry.id,
      startedBy: { id: member.user.id }
    });
    const board = await member.agent.get(`/api/projects/${project.id}/kanban`);
    const card = Object.values(board.body.columns)
      .flat()
      .find(({ id }) => id === task.id);
    expect(card.runningTimer).toMatchObject({ id: started.body.entry.id });
    await member.mutate('post', `${entriesPath(task.id)}/stop`).send({});
    expect((await member.agent.get(`/api/tasks/${task.id}`)).body.task.runningTimer).toBeNull();
  });

  it('preserva o esforço lançado antes das sessões existirem', async () => {
    const project = await createProject(prisma);
    const member = await register('s106-legacy@example.invalid', 'MEMBER', project.id);
    // Tarefa como ela chega do contrato anterior: esforço preenchido à mão e
    // nenhuma sessão de tempo, exatamente o estado que a migration captura.
    const task = await createTask(prisma, project.id, { estimatedEffort: 20 });
    await prisma.task.update({
      where: { id: task.id },
      data: { actualEffort: 8, legacyActualEffort: 8 }
    });

    const before = await member.agent.get(entriesPath(task.id));
    expect(before.body.effort).toMatchObject({
      completedCount: 0,
      legacyHours: 8,
      actualHours: 8,
      trackedSeconds: 0
    });

    const created = await member.mutate('post', entriesPath(task.id)).send({ hours: 1 });
    expect(created.status).toBe(201);
    // O primeiro registro soma às 8h herdadas em vez de substituí-las.
    expect(created.body.effort).toMatchObject({
      actualHours: 9,
      legacyHours: 8,
      trackedSeconds: 3600,
      completedCount: 1
    });
    expect((await prisma.task.findUnique({ where: { id: task.id } })).actualEffort).toBe(9);

    // Excluir a única sessão volta ao total herdado, não a zero.
    const removed = await member.mutate(
      'delete',
      `${entriesPath(task.id)}/${created.body.entry.id}`
    );
    expect(removed.status).toBe(200);
    expect(removed.body.effort).toMatchObject({ actualHours: 8, completedCount: 0 });
    expect((await prisma.task.findUnique({ where: { id: task.id } })).actualEffort).toBe(8);
  });
});

it('keeps immutable create/update/delete effort events and filters independently', async () => {
  const project = await createProject(prisma);
  const member = await register('effort-history@example.invalid', 'MEMBER', project.id);
  const task = await createTask(prisma, project.id);
  const created = await member.mutate('post', entriesPath(task.id)).send({ hours: 3 });
  const entry = created.body.entry;
  const edited = await member
    .mutate('patch', `${entriesPath(task.id)}/${entry.id}`)
    .send({ hours: 4, expectedUpdatedAt: entry.updatedAt });
  expect(edited.status).toBe(200);
  expect(edited.body.effort.actualHours).toBe(4);
  const stale = await member
    .mutate('patch', `${entriesPath(task.id)}/${entry.id}`)
    .send({ hours: 5, expectedUpdatedAt: entry.updatedAt });
  expect(stale.status).toBe(409);
  expect(
    (await member.mutate('delete', `${entriesPath(task.id)}/${entry.id}`).send({})).status
  ).toBe(200);
  const history = await member.agent.get(`${entriesPath(task.id)}/history`);
  expect(history.status).toBe(200);
  if (process.env.S109_EFFORT_QA_OUTPUT)
    writeFileSync(process.env.S109_EFFORT_QA_OUTPUT, JSON.stringify(history.body));
  expect(history.body.items.map((row) => row.eventType)).toEqual(['DELETED', 'UPDATED', 'CREATED']);
  expect(history.body.items[1]).toMatchObject({
    previousSeconds: 10800,
    newSeconds: 14400,
    source: 'MANUAL',
    actor: { id: member.user.id },
    canEdit: false,
    canDelete: false
  });
  expect((await member.agent.get(entriesPath(task.id))).body.effort.actualHours).toBe(0);
  const filtered = await member.agent.get(`${entriesPath(task.id)}/history`).query({
    source: 'MANUAL',
    eventType: 'UPDATED',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10)
  });
  expect(filtered.body.items).toHaveLength(1);
  expect(
    (await member.agent.get(`${entriesPath(task.id)}/history`).query({ source: 'TIMER' })).body
      .items
  ).toEqual([]);
});

it('audits timer adjustments, preserves clock timestamps, rejects other members and serializes edits', async () => {
  const project = await createProject(prisma),
    owner = await register('effort-owner@example.invalid', 'MEMBER', project.id),
    other = await register('effort-other@example.invalid', 'MEMBER', project.id);
  const task = await createTask(prisma, project.id);
  await owner.mutate('post', `${entriesPath(task.id)}/start`).send({});
  const stopped = await owner.mutate('post', `${entriesPath(task.id)}/stop`).send({});
  const entry = stopped.body.entry;
  expect(
    (
      await other
        .mutate('patch', `${entriesPath(task.id)}/${entry.id}`)
        .send({ hours: 3, expectedUpdatedAt: entry.updatedAt })
    ).status
  ).toBe(403);
  const edits = await Promise.all(
    [3, 4].map((hours) =>
      owner
        .mutate('patch', `${entriesPath(task.id)}/${entry.id}`)
        .send({ hours, expectedUpdatedAt: entry.updatedAt })
    )
  );
  expect(edits.map((r) => r.status).sort()).toEqual([200, 409]);
  const history = (
    await owner.agent.get(`${entriesPath(task.id)}/history`).query({ source: 'TIMER' })
  ).body.items;
  expect(history).toHaveLength(2);
  expect(history[0]).toMatchObject({
    eventType: 'UPDATED',
    source: 'TIMER',
    snapshotStartedAt: entry.startedAt,
    snapshotEndedAt: entry.endedAt,
    actor: { id: owner.user.id }
  });
  await owner.mutate('delete', `${entriesPath(task.id)}/${entry.id}`).send({});
  expect(
    (await owner.agent.get(`${entriesPath(task.id)}/history`).query({ eventType: 'DELETED' })).body
      .items
  ).toHaveLength(1);
  expect(
    (await owner.agent.get(`${entriesPath(task.id)}/history`).query({ endDate: '2000-01-01' })).body
      .items
  ).toEqual([]);
  expect(
    (await owner.agent.get(`${entriesPath(task.id)}/history`).query({ eventType: 'UNKNOWN' }))
      .status
  ).toBe(400);
  expect(
    (
      await owner.agent
        .get(`${entriesPath(task.id)}/history`)
        .query({ startDate: '2026-09-12', endDate: '2026-09-01' })
    ).status
  ).toBe(400);
  const foreignProject = await createProject(prisma),
    foreign = await createTask(prisma, foreignProject.id);
  expect((await owner.agent.get(`${entriesPath(foreign.id)}/history`)).status).toBe(404);
});
it('rolls back duration and actual effort when functional history cannot be written', async () => {
  const project = await createProject(prisma),
    owner = await register('effort-rollback@example.invalid', 'MEMBER', project.id),
    task = await createTask(prisma, project.id);
  const entry = (await owner.mutate('post', entriesPath(task.id)).send({ hours: 3 })).body.entry;
  const { createTaskTimeEntryRepository } =
    await import('../../src/modules/tasks/repositories/task-time-entry.repository.js');
  const guarded = prisma.$extends({
    query: {
      taskEffortHistoryEntry: {
        create() {
          throw new Error('controlled effort history failure');
        }
      }
    }
  });
  const repo = createTaskTimeEntryRepository(guarded);
  await expect(
    repo.updateAtomic(task.id, entry.id, {
      projectId: project.id,
      actorUserId: owner.user.id,
      durationSeconds: 14400,
      expectedUpdatedAt: entry.updatedAt
    })
  ).rejects.toThrow('controlled effort history failure');
  expect((await prisma.taskTimeEntry.findUnique({ where: { id: entry.id } })).durationSeconds).toBe(
    10800
  );
  expect((await prisma.task.findUnique({ where: { id: task.id } })).actualEffort).toBe(3);
  expect(await prisma.taskEffortHistoryEntry.count({ where: { taskId: task.id } })).toBe(1);
});
