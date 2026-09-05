import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import {
  createProject,
  createSprint,
  createTask,
  createRequirement
} from '../fixtures/factories.js';

let prisma;
let sprints;
let tasks;
let kanban;
let actorUserId;
const context = () => ({ actorUserId });
const status = (sprint, value) => sprints.updateSprintStatus(sprint.id, value, context());
const scope = (sprint, items) =>
  sprints.replaceTasks(
    sprint.id,
    items.map((task) => task.id),
    context()
  );
const move = (task, toStatus) =>
  kanban.moveTask(task.id, { toStatus }, { actor: { id: actorUserId, name: 'Planning QA' } });
beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ sprintService: sprints } = await import('../../src/modules/sprints/sprint.service.js'));
  ({ taskCrudService: tasks } =
    await import('../../src/modules/tasks/services/task-crud.service.js'));
  ({ taskKanbanService: kanban } =
    await import('../../src/modules/tasks/services/task-kanban.service.js'));
  await cleanTestDatabase(prisma);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await cleanTestDatabase(prisma);
});
afterAll(async () => prisma.$disconnect());

async function fixture(withNext = true) {
  actorUserId = (
    await prisma.user.create({
      data: {
        name: 'Planning QA',
        username: 'planningcarry',
        email: 'planningcarry@example.invalid',
        passwordHash: 'x'
      }
    })
  ).id;
  const project = await createProject(prisma);
  const startDate = new Date(Date.now() - 3 * 86400000);
  const endDate = new Date(Date.now() + 86400000);
  const first = await createSprint(prisma, project.id, { name: 'Sprint 1', startDate, endDate });
  const next = withNext
    ? await createSprint(prisma, project.id, {
        name: 'Sprint 2',
        startDate: endDate,
        endDate: new Date(endDate.getTime() + 7 * 86400000)
      })
    : null;
  const items = [];
  for (const [index, effort] of [3, 5, 8, 13].entries())
    items.push(
      await createTask(prisma, project.id, { title: `T${index + 1}`, estimatedEffort: effort })
    );
  return { project, first, next, items };
}

async function prepare(f) {
  const [t1, t2, t3, t4] = f.items;
  await scope(f.first, [t1, t2, t3]);
  await scope(f.first, [t1, t2]);
  await status(f.first, 'EM_ANDAMENTO');
  await scope(f.first, [t1, t2, t4]);
  await move(t1, 'CONCLUIDO');
  await move(t2, 'EM_ANDAMENTO');
}

async function historical(sprint) {
  const progress = await sprints.getSprintProgress(sprint.id);
  // Continuity metadata may describe later work; every frozen metric remains in the comparison.
  delete progress.carryOver;
  return {
    progress,
    summary: (await sprints.getSprintById(sprint.id)).historicalSummary,
    memberships: await prisma.sprintTask.findMany({
      where: { sprintId: sprint.id },
      orderBy: { id: 'asc' }
    })
  };
}

describe('Planning FIX-02 core carry-over and terminal presentation', () => {
  it('moves only current pending Tasks to the contiguous next Sprint and freezes S1 after S2 work', async () => {
    const f = await fixture();
    const [t1, t2, t3, t4] = f.items;
    await prepare(f);
    const requirementBefore = await createRequirement(prisma, f.project.id);
    await tasks.updateTask(t2.id, { requirementId: requirementBefore.id }, context());
    const comment = await prisma.taskComment.create({
      data: {
        projectId: f.project.id,
        taskId: t2.id,
        authorUserId: actorUserId,
        content: 'Preserved across Sprints'
      }
    });
    const closed = await status(f.first, 'CONCLUIDA');
    expect(closed).toMatchObject({
      returnedToBacklog: 0,
      carryOver: {
        destinationSprintId: f.next.id,
        destinationSprintName: f.next.name,
        movedTasks: 2
      }
    });
    expect(
      await prisma.task.findMany({
        where: { projectId: f.project.id },
        select: { id: true, sprintId: true },
        orderBy: { id: 'asc' }
      })
    ).toEqual([
      { id: t1.id, sprintId: f.first.id },
      { id: t2.id, sprintId: f.next.id },
      { id: t3.id, sprintId: null },
      { id: t4.id, sprintId: f.next.id }
    ]);
    const before = await historical(f.first);
    expect(before.summary).toMatchObject({
      totalTasks: 3,
      completedTasks: 1,
      totalPoints: 21,
      completedPoints: 3,
      percentage: 14,
      plannedTasks: 2,
      plannedPoints: 8,
      historicalLimitations: []
    });
    expect(before.progress.scopeChange).toMatchObject({ added: [{ taskId: t4.id }], removed: [] });
    expect(before.progress.burndown.totalPoints).toBe(21);
    expect(
      await prisma.sprintTask.findMany({
        where: { sprintId: f.next.id },
        orderBy: { taskId: 'asc' }
      })
    ).toMatchObject([
      { taskId: t2.id, addedAfterStart: false, carriedFromSprintId: f.first.id, removedAt: null },
      { taskId: t4.id, addedAfterStart: false, carriedFromSprintId: f.first.id, removedAt: null }
    ]);
    const history = await prisma.taskHistoryEntry.findMany({
      where: { field: 'SPRINT', fromValue: String(f.first.id), toValue: String(f.next.id) },
      orderBy: { taskId: 'asc' }
    });
    expect(history).toMatchObject([
      { taskId: t2.id, actorUserId },
      { taskId: t4.id, actorUserId }
    ]);
    expect(history).toHaveLength(2);
    expect((await prisma.task.findUnique({ where: { id: t2.id } })).requirementId).toBe(
      requirementBefore.id
    );
    expect(await prisma.taskComment.findUnique({ where: { id: comment.id } })).toEqual(comment);
    await status(f.next, 'EM_ANDAMENTO');
    expect((await sprints.getSprintProgress(f.next.id)).planned.denominator).toBe(2);
    await move(t2, 'CONCLUIDO');
    await move(t4, 'EM_ANDAMENTO');
    await tasks.updateTask(t2.id, { estimatedEffort: 1 }, context());
    await tasks.updateTask(
      t4.id,
      { estimatedEffort: 34, title: 'T4 future', priority: 'ALTA', deadline: '2026-10-01' },
      context()
    );
    const requirement = await createRequirement(prisma, f.project.id);
    await tasks.updateTask(t4.id, { requirementId: requirement.id }, context());
    expect(await historical(f.first)).toEqual(before);
    const schedule = await sprints.getSchedule(f.project.id);
    expect(schedule.sprints.find((s) => s.id === f.first.id).historicalSummary).toEqual(
      before.summary
    );
    expect(
      schedule.sprints.find((s) => s.id === f.first.id).tasks.find((task) => task.id === t4.id)
    ).toMatchObject({ sprintId: f.next.id, estimatedEffort: 34 });
    expect(
      (await sprints.findSprintsByProject(f.project.id)).find((s) => s.id === f.first.id)
        .historicalSummary
    ).toEqual(before.summary);
  });

  it('projects frozen values without relying on current Task DTOs even without a next Sprint', async () => {
    const f = await fixture(false);
    await prepare(f);
    await status(f.first, 'CONCLUIDA');
    await tasks.updateTask(f.items[1].id, { estimatedEffort: 40 }, context());
    const schedule = await sprints.getSchedule(f.project.id);
    expect(schedule.sprints[0].historicalSummary).toMatchObject({
      totalTasks: 3,
      completedTasks: 1,
      totalPoints: 21,
      completedPoints: 3,
      percentage: 14
    });
    expect(schedule.unassignedTasks.find((task) => task.id === f.items[1].id).sprintId).toBeNull();
  });

  it('selects the earliest future planned Sprint, ignoring earlier and other-project Sprints', async () => {
    const f = await fixture();
    const later = await createSprint(prisma, f.project.id, {
      startDate: f.next.endDate,
      endDate: new Date(f.next.endDate.getTime() + 86400000)
    });
    await createSprint(prisma, f.project.id, {
      startDate: new Date(f.first.startDate.getTime() - 2 * 86400000),
      endDate: f.first.startDate
    });
    const other = await createProject(prisma);
    await createSprint(prisma, other.id, { startDate: f.first.endDate, endDate: f.next.endDate });
    await prepare(f);
    expect((await status(f.first, 'CONCLUIDA')).carryOver.destinationSprintId).toBe(f.next.id);
    expect(await prisma.task.count({ where: { sprintId: later.id } })).toBe(0);
  });

  it.each(['CANCELADA', 'CONCLUIDA', 'EM_ANDAMENTO'])(
    'ignores a future %s destination',
    async (invalidStatus) => {
      const f = await fixture();
      await prepare(f);
      // An isolated legacy-state fixture also exercises the active-target exclusion.
      await prisma.sprint.update({ where: { id: f.next.id }, data: { status: invalidStatus } });
      const result = await status(f.first, 'CONCLUIDA');
      expect(result.carryOver).toBeNull();
      expect(result.returnedToBacklog).toBe(2);
      expect(await prisma.task.count({ where: { sprintId: f.next.id } })).toBe(0);
    }
  );

  it('reactivates destination membership once and captures it at the later start', async () => {
    const f = await fixture();
    await scope(f.next, [f.items[1]]);
    await scope(f.next, []);
    const original = await prisma.sprintTask.findFirst({ where: { sprintId: f.next.id } });
    await prepare(f);
    await status(f.first, 'CONCLUIDA');
    expect(
      await prisma.sprintTask.count({ where: { sprintId: f.next.id, taskId: f.items[1].id } })
    ).toBe(1);
    expect(await prisma.sprintTask.findUnique({ where: { id: original.id } })).toMatchObject({
      removedAt: null,
      addedAfterStart: false
    });
    await status(f.next, 'EM_ANDAMENTO');
    expect(await prisma.sprintTask.findUnique({ where: { id: original.id } })).toMatchObject({
      plannedAtStart: true,
      pointsAtPlanning: 5
    });
  });

  it('rolls back the close, snapshot and transfer when a required write fails', async () => {
    const f = await fixture();
    await prepare(f);
    const { auditRepository } = await import('../../src/modules/audit/audit.repository.js');
    const audit = auditRepository.create.bind(auditRepository);
    let sawTransferred = false;
    vi.spyOn(auditRepository, 'create').mockImplementation(async (event, tx) => {
      if (event.action === 'SPRINT_STATUS_CHANGED') {
        sawTransferred = (await tx.task.count({ where: { sprintId: f.next.id } })) === 2;
        throw new Error('Controlled write failure after carry-over');
      }
      return audit(event, tx);
    });
    await expect(status(f.first, 'CONCLUIDA')).rejects.toThrow('Controlled write failure');
    expect(sawTransferred).toBe(true);
    expect(await prisma.sprint.findUnique({ where: { id: f.first.id } })).toMatchObject({
      status: 'EM_ANDAMENTO',
      closedAt: null
    });
    expect(await prisma.sprintTask.count({ where: { sprintId: f.next.id } })).toBe(0);
    expect(
      await prisma.sprintTask.count({ where: { sprintId: f.first.id, closedAt: { not: null } } })
    ).toBe(0);
    expect(
      await prisma.taskHistoryEntry.count({
        where: { field: 'SPRINT', toValue: String(f.next.id) }
      })
    ).toBe(0);
  });

  it('enforces the canonical destination capacity and rolls back instead of partial transfer', async () => {
    const f = await fixture();
    const full = [];
    for (let index = 0; index < 99; index += 1) full.push(await createTask(prisma, f.project.id));
    await scope(f.next, full);
    await prepare(f);
    await expect(status(f.first, 'CONCLUIDA')).rejects.toMatchObject({
      code: 'SPRINT_TASK_LIMIT_REACHED'
    });
    expect((await prisma.sprint.findUnique({ where: { id: f.first.id } })).status).toBe(
      'EM_ANDAMENTO'
    );
    expect(await prisma.task.count({ where: { sprintId: f.next.id } })).toBe(99);
  });

  it('serializes concurrent closes and refuses a repeated close without duplicated history or membership', async () => {
    const f = await fixture();
    await prepare(f);
    const results = await Promise.allSettled([
      status(f.first, 'CONCLUIDA'),
      status(f.first, 'CONCLUIDA')
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected').reason).toMatchObject({
      code: 'SPRINT_INVALID_TRANSITION'
    });
    await expect(status(f.first, 'CONCLUIDA')).rejects.toMatchObject({
      code: 'SPRINT_INVALID_TRANSITION'
    });
    expect(await prisma.sprintTask.count({ where: { sprintId: f.next.id } })).toBe(2);
    expect(
      await prisma.taskHistoryEntry.count({
        where: { field: 'SPRINT', fromValue: String(f.first.id), toValue: String(f.next.id) }
      })
    ).toBe(2);
  });

  it('cancellation still uses backlog and freezes the terminal display', async () => {
    const f = await fixture();
    await prepare(f);
    const result = await status(f.first, 'CANCELADA');
    expect(result).toMatchObject({ carryOver: null, returnedToBacklog: 2 });
    const before = await historical(f.first);
    await tasks.updateTask(f.items[1].id, { estimatedEffort: 1 }, context());
    await tasks.deleteTask(f.items[3].id, context());
    const after = await historical(f.first);
    expect(after.summary).toEqual(before.summary);
    expect(after.progress.burndown).toEqual(before.progress.burndown);
    expect((await sprints.getSchedule(f.project.id)).sprints[0].historicalSummary).toEqual(
      before.summary
    );
  });
});
