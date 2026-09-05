import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
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
let prisma, sprints, tasks, kanban, actorUserId;
const context = () => ({ actorUserId });
const scope = (sprint, items) =>
  sprints.replaceTasks(
    sprint.id,
    items.map((t) => t.id),
    context()
  );
const status = (sprint, value) => sprints.updateSprintStatus(sprint.id, value, context());
const move = (task, toStatus) =>
  kanban.moveTask(task.id, { toStatus }, { actor: { id: actorUserId, name: 'Frozen QA' } });
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
afterEach(async () => cleanTestDatabase(prisma));
afterAll(async () => prisma.$disconnect());
async function fixture() {
  const actor = await prisma.user.create({
    data: {
      name: 'Frozen QA',
      username: 'frozenqa',
      email: 'frozen@example.invalid',
      passwordHash: 'x'
    }
  });
  actorUserId = actor.id;
  const project = await createProject(prisma);
  await prisma.projectMembership.create({
    data: { projectId: project.id, userId: actorUserId, role: 'OWNER' }
  });
  const first = await createSprint(prisma, project.id, {
    name: 'S1',
    startDate: new Date('2026-09-01'),
    endDate: new Date('2026-09-05')
  });
  const next = await createSprint(prisma, project.id, {
    name: 'S2',
    startDate: first.endDate,
    endDate: new Date('2026-09-12')
  });
  const items = [];
  for (const [i, effort] of [3, 5, 8].entries())
    items.push(
      await createTask(prisma, project.id, {
        title: `T${i + 1}`,
        estimatedEffort: effort,
        responsibleUserId: actorUserId,
        priority: 'MEDIA',
        deadline: new Date('2026-09-04')
      })
    );
  await scope(first, items);
  await status(first, 'EM_ANDAMENTO');
  await move(items[1], 'EM_ANDAMENTO');
  await move(items[2], 'CONCLUIDO');
  return { project, first, next, items };
}
describe('Planning FIX-03 frozen Kanban projection', () => {
  it('keeps every closing card and field after carry-over and future work in S2', async () => {
    const f = await fixture();
    const requirement = await createRequirement(prisma, f.project.id);
    await tasks.updateTask(f.items[1].id, { requirementId: requirement.id }, context());
    await status(f.first, 'CONCLUIDA');
    const before = await sprints.findTasksBySprint(f.first.id);
    expect(before.map((t) => [t.id, t.status, t.estimatedEffort])).toEqual([
      [f.items[0].id, 'A_FAZER', 3],
      [f.items[1].id, 'EM_ANDAMENTO', 5],
      [f.items[2].id, 'CONCLUIDO', 8]
    ]);
    await status(f.next, 'EM_ANDAMENTO');
    await move(f.items[0], 'CONCLUIDO');
    await move(f.items[1], 'A_FAZER');
    await tasks.updateTask(
      f.items[0].id,
      {
        title: 'Future title',
        estimatedEffort: 13,
        priority: 'CRITICA',
        responsibleUserId: null,
        deadline: '2026-10-01'
      },
      context()
    );
    await tasks.updateTask(f.items[1].id, { estimatedEffort: 21, requirementId: null }, context());
    expect(await sprints.findTasksBySprint(f.first.id)).toEqual(before);
    const live = await sprints.findTasksBySprint(f.next.id);
    expect(live.map((t) => [t.id, t.status, t.estimatedEffort])).toEqual([
      [f.items[0].id, 'CONCLUIDO', 13],
      [f.items[1].id, 'A_FAZER', 21]
    ]);
    const whole = await kanban.getKanbanBoard(f.project.id);
    expect(Object.values(whole.columns).flat()).toHaveLength(3);
  });
  it('retains a frozen card when its mutable Task is later deleted', async () => {
    const f = await fixture();
    await status(f.first, 'CONCLUIDA');
    const before = await sprints.findTasksBySprint(f.first.id);
    await tasks.deleteTask(f.items[0].id, context());
    const after = await sprints.findTasksBySprint(f.first.id);
    expect(after).toHaveLength(3);
    expect(after[0]).toMatchObject({
      id: before[0].id,
      title: 'T1',
      status: 'A_FAZER',
      estimatedEffort: 3
    });
  });
  it('uses closing membership, excluding pre-close removals and including late additions', async () => {
    const f = await fixture();
    const late = await createTask(prisma, f.project.id, { title: 'Late', estimatedEffort: 2 });
    await scope(f.first, [f.items[0], f.items[2], late]);
    await status(f.first, 'CONCLUIDA');
    const result = await sprints.getSprintTaskProjection(f.first.id);
    expect(result.tasks.map((t) => t.id)).toEqual([f.items[0].id, f.items[2].id, late.id]);
    expect(result.tasks.find((t) => t.id === late.id).addedAfterStart).toBe(true);
    expect(result.historicalLimitations).toEqual([]);
    expect((await sprints.getSprintProgress(f.first.id)).scopeChange.removed).toMatchObject([
      { taskId: f.items[1].id }
    ]);
  });
  it('reports legacy card gaps without filling them from the current Task', async () => {
    const f = await fixture();
    await status(f.first, 'CANCELADA');
    const before = await sprints.getSprintTaskProjection(f.first.id);
    expect(before.isFrozen).toBe(true);
    await prisma.$executeRaw`UPDATE SprintTask SET closingTaskSnapshot = NULL WHERE sprintId = ${f.first.id}`;
    await tasks.updateTask(
      f.items[0].id,
      { title: 'Never historical', estimatedEffort: 100 },
      context()
    );
    const legacy = await sprints.getSprintTaskProjection(f.first.id);
    expect(legacy.historicalLimitations).toContain('LEGACY_CLOSING_TASK_SNAPSHOT_UNAVAILABLE');
    expect(legacy.tasks[0]).toMatchObject({
      status: 'A_FAZER',
      estimatedEffort: 3,
      snapshotAvailable: false,
      priority: null,
      traceabilityCounts: null
    });
    expect(legacy.tasks[0].title).not.toContain('Never historical');
  });
});
