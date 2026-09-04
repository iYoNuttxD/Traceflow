import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createProject, createSprint, createTask } from '../fixtures/factories.js';

let prisma;
let sprintService;
let taskService;
let taskKanbanService;
let actorUserId;
beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ sprintService } = await import('../../src/modules/sprints/sprint.service.js'));
  ({ taskCrudService: taskService } =
    await import('../../src/modules/tasks/services/task-crud.service.js'));
  ({ taskKanbanService } = await import('../../src/modules/tasks/services/task-kanban.service.js'));
  await cleanTestDatabase(prisma);
});
afterEach(() => cleanTestDatabase(prisma));
afterAll(async () => {
  await prisma.$disconnect();
});

async function fixture() {
  const actor = await prisma.user.create({
    data: {
      name: 'Planning QA',
      username: 'planningqa',
      email: 'planningqa@example.invalid',
      passwordHash: 'x'
    }
  });
  actorUserId = actor.id;
  const project = await createProject(prisma);
  const sprint = await createSprint(prisma, project.id, {
    startDate: new Date(Date.now() - 86400000),
    endDate: new Date(Date.now() + 5 * 86400000)
  });
  const a = await createTask(prisma, project.id, { estimatedEffort: 5 });
  const b = await createTask(prisma, project.id, { estimatedEffort: 3 });
  return { sprint, a, b };
}
const context = () => ({ actorUserId });
const scope = (sprint, tasks) =>
  sprintService.replaceTasks(
    sprint.id,
    tasks.map((t) => t.id),
    context()
  );
const start = (sprint) => sprintService.updateSprintStatus(sprint.id, 'EM_ANDAMENTO', context());
const close = (sprint, status = 'CONCLUIDA') =>
  sprintService.updateSprintStatus(sprint.id, status, context());
const progress = (sprint) => sprintService.getSprintProgress(sprint.id);

describe('F1 — evolução encerrada e Task mutável', () => {
  it.each([13, 1])('mantém corte, pontos, série e métricas depois de 5 → %s', async (effort) => {
    const { sprint, a } = await fixture();
    await scope(sprint, [a]);
    await start(sprint);
    await close(sprint);
    const frozen = await progress(sprint);
    expect(frozen.burndown.totalPoints).toBe(5);
    expect((await prisma.task.findUnique({ where: { id: a.id } })).sprintId).toBeNull();
    await taskService.updateTask(a.id, { estimatedEffort: effort }, context());
    expect((await prisma.task.findUnique({ where: { id: a.id } })).estimatedEffort).toBe(effort);
    expect(await progress(sprint)).toEqual(frozen);
  });
  it('preserva os números e a série após exclusão da Task no backlog', async () => {
    const { sprint, a } = await fixture();
    await scope(sprint, [a]);
    await start(sprint);
    await close(sprint);
    const frozen = await progress(sprint);
    await taskService.deleteTask(a.id, context());
    const after = await progress(sprint);
    expect(after.cutoff).toBe(frozen.cutoff);
    expect(after.planned).toEqual(frozen.planned);
    expect(after.current).toEqual(frozen.current);
    expect(after.burndown).toEqual(frozen.burndown);
  });
});

describe('F2 — membership no instante do start', () => {
  it('A: remove A antes do start; planeja somente B', async () => {
    const { sprint, a, b } = await fixture();
    await scope(sprint, [a, b]);
    await scope(sprint, [b]);
    await start(sprint);
    const result = await progress(sprint);
    expect(result.planned.denominator).toBe(1);
    expect(result.scopeChange).toEqual({ added: [], removed: [] });
    const memberships = await prisma.sprintTask.findMany({
      where: { sprintId: sprint.id },
      orderBy: { taskId: 'asc' }
    });
    expect(memberships).toMatchObject([
      { taskId: a.id, plannedAtStart: false, pointsAtPlanning: null },
      { taskId: b.id, plannedAtStart: true, pointsAtPlanning: 3 }
    ]);
  });
  it('B: A e B presentes no start pertencem ao planejamento', async () => {
    const { sprint, a, b } = await fixture();
    await scope(sprint, [a, b]);
    await start(sprint);
    expect((await progress(sprint)).planned.denominator).toBe(2);
  });
  it('C: A removida antes e reinserida depois é adição, sem reescrever baseline', async () => {
    const { sprint, a, b } = await fixture();
    await scope(sprint, [a, b]);
    await scope(sprint, [b]);
    await start(sprint);
    await scope(sprint, [a, b]);
    const result = await progress(sprint);
    expect(result.planned.denominator).toBe(1);
    expect(result.current.denominator).toBe(2);
    expect(result.scopeChange.added.map((x) => x.taskId)).toEqual([a.id]);
    expect(
      (await sprintService.findTasksBySprint(sprint.id)).find((task) => task.id === a.id)
    ).toMatchObject({ addedAfterStart: true });
    expect(result.scopeChange.removed).toEqual([]);
  });
  it('D: A removida depois do start permanece planejada', async () => {
    const { sprint, a, b } = await fixture();
    await scope(sprint, [a, b]);
    await start(sprint);
    await scope(sprint, [b]);
    const result = await progress(sprint);
    expect(result.planned.denominator).toBe(2);
    expect(result.scopeChange.removed.map((x) => x.taskId)).toEqual([a.id]);
  });
  it('E: repetidas entradas e saídas antes do start não criam escopo planejado', async () => {
    const { sprint, a } = await fixture();
    await scope(sprint, [a]);
    await scope(sprint, []);
    await scope(sprint, [a]);
    await scope(sprint, []);
    await start(sprint);
    const result = await progress(sprint);
    expect(result.planned.denominator).toBe(0);
    expect(result.planned.hasData).toBe(false);
    expect(result.scopeChange).toEqual({ added: [], removed: [] });
  });
});

describe('historical snapshot invariants', () => {
  it('keeps planning points immutable while open metrics remain operational', async () => {
    const { sprint, a, b } = await fixture();
    await scope(sprint, [a, b]);
    await start(sprint);
    const stored = await prisma.sprint.findUnique({ where: { id: sprint.id } });
    expect(stored.planningSnapshotAt).toEqual(stored.startedAt);
    await taskService.updateTask(a.id, { estimatedEffort: 13 }, context());
    await taskKanbanService.moveTask(
      a.id,
      { toStatus: 'CONCLUIDO' },
      { actor: { id: actorUserId, name: 'QA' } }
    );
    const open = await progress(sprint);
    expect(open.current).toMatchObject({ numerator: 1, denominator: 2, percentage: 50 });
    expect(open.burndown.totalPoints).toBe(16);
    await close(sprint);
    const frozen = await progress(sprint);
    expect(frozen.burndown.totalPoints).toBe(16);
    expect(frozen.historicalLimitations).toEqual([]);
    const planned = await prisma.sprintTask.findUnique({
      where: { sprintId_taskId: { sprintId: sprint.id, taskId: a.id } }
    });
    expect(planned).toMatchObject({
      plannedAtStart: true,
      pointsAtPlanning: 5,
      pointsAtClose: 13,
      exitStatus: 'CONCLUIDO'
    });
    expect(planned.completedAtClose).toBeInstanceOf(Date);
    await taskService.deleteTask(a.id, context());
    expect((await progress(sprint)).burndown).toEqual(frozen.burndown);
    expect((await progress(sprint)).current).toEqual(frozen.current);
  });

  it('retains a planned membership through removal and reentry after start', async () => {
    const { sprint, a, b } = await fixture();
    await scope(sprint, [a, b]);
    await start(sprint);
    await scope(sprint, [b]);
    await scope(sprint, [a, b]);
    const result = await progress(sprint);
    expect(result.planned.denominator).toBe(2);
    expect(result.scopeChange).toEqual({ added: [], removed: [] });
    expect(
      await prisma.sprintTask.findUnique({
        where: { sprintId_taskId: { sprintId: sprint.id, taskId: a.id } }
      })
    ).toMatchObject({ plannedAtStart: true, pointsAtPlanning: 5, addedAfterStart: false });
  });

  it.each([true, false])(
    'freezes cancellation and its cutoff even with empty scope=%s',
    async (empty) => {
      const { sprint, a } = await fixture();
      if (!empty) await scope(sprint, [a]);
      await start(sprint);
      await close(sprint, 'CANCELADA');
      const frozen = await progress(sprint);
      await taskService.updateTask(a.id, { estimatedEffort: 13 }, context());
      expect(await progress(sprint)).toEqual(frozen);
      const stored = await prisma.sprint.findUnique({ where: { id: sprint.id } });
      expect(frozen.cutoff).toBe(stored.closedAt.toISOString());
      await expect(scope(sprint, [])).rejects.toMatchObject({ code: 'SPRINT_SCOPE_LOCKED' });
    }
  );

  it('reports missing legacy history instead of reading current effort', async () => {
    const { sprint, a } = await fixture();
    await scope(sprint, [a]);
    const at = new Date();
    // A pre-migration terminal row has no planning/point snapshots.
    await prisma.sprint.update({
      where: { id: sprint.id },
      data: { status: 'CONCLUIDA', startedAt: at, completedAt: at }
    });
    const legacy = await progress(sprint);
    expect(legacy.historicalLimitations).toEqual(
      expect.arrayContaining([
        'LEGACY_PLANNING_SNAPSHOT_UNAVAILABLE',
        'LEGACY_CLOSING_POINTS_UNAVAILABLE',
        'LEGACY_CLOSING_STATUS_UNAVAILABLE'
      ])
    );
    expect(legacy.burndown).toMatchObject({ hasData: false, totalPoints: 0, days: [] });
    await prisma.task.update({
      where: { id: a.id },
      data: { estimatedEffort: 13, status: 'CONCLUIDO' }
    });
    expect(await progress(sprint)).toEqual(legacy);
  });
});
