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
  createRequirement,
  createPullRequest,
  createCommit,
  createIssue
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
afterEach(async () => {
  vi.restoreAllMocks();
  await cleanTestDatabase(prisma);
});
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

describe('FIX-04 complete closing snapshot v2', () => {
  it('preserves every displayed field, assignee and linked artifact after current edits and deletion', async () => {
    const f = await fixture();
    const id = f.items[1].id;
    const createdAt = new Date('2026-08-01T12:00:00Z');
    const requirement = await createRequirement(prisma, f.project.id, {
      title: 'R1',
      status: 'EM_ANDAMENTO'
    });
    const pullRequest = await createPullRequest(prisma, f.project.id, {
      number: 10,
      title: 'PR original',
      githubUrl: 'https://github.com/example/repo/pull/10'
    });
    const commits = [];
    for (const message of ['A', 'B'])
      commits.push(
        await createCommit(prisma, f.project.id, {
          message,
          authorName: 'Autor original',
          githubUrl: 'https://github.com/example/repo/commit/abc'
        })
      );
    const issue = await createIssue(prisma, f.project.id, {
      number: 5,
      title: 'Issue original',
      labels: ['bug'],
      githubUrl: 'https://github.com/example/repo/issues/5'
    });
    await prisma.task.update({
      where: { id },
      data: {
        title: 'Implementar checkout',
        description: 'Descrição original da tarefa',
        priority: 'ALTA',
        deadline: new Date('2026-09-10'),
        actualEffort: 3,
        createdAt,
        requirementId: requirement.id,
        pullRequestId: pullRequest.id,
        commitLinks: { create: commits.map((c) => ({ commitId: c.id })) },
        issueLinks: { create: { issueId: issue.id } }
      }
    });
    await status(f.first, 'CONCLUIDA');
    const before = await sprints.getSprintTaskProjection(f.first.id);
    const snapshot = before.tasks.find((t) => t.id === id);
    expect(before.historicalLimitations).toEqual([]);
    expect(snapshot).toMatchObject({
      snapshotVersion: 2,
      title: 'Implementar checkout',
      description: 'Descrição original da tarefa',
      priority: 'ALTA',
      responsibleUserId: actorUserId,
      responsibleDisplayName: 'Frozen QA',
      deadline: '2026-09-10T00:00:00.000Z',
      status: 'EM_ANDAMENTO',
      estimatedEffort: 5,
      actualEffort: 3,
      createdAt: createdAt.toISOString(),
      requirement: { id: requirement.id, title: 'R1', status: 'EM_ANDAMENTO' },
      pullRequest: {
        id: pullRequest.id,
        number: 10,
        title: 'PR original',
        state: pullRequest.state,
        githubUrl: pullRequest.githubUrl
      },
      issues: [
        {
          id: issue.id,
          number: 5,
          title: 'Issue original',
          state: issue.state,
          labels: ['bug'],
          githubUrl: issue.githubUrl
        }
      ]
    });
    for (const c of commits)
      expect(snapshot.commits).toContainEqual({
        id: c.id,
        hash: c.hash,
        message: c.message,
        authorName: c.authorName,
        date: c.date.toISOString(),
        githubUrl: c.githubUrl
      });
    expect(JSON.stringify(snapshot)).not.toMatch(/authorEmail|passwordHash|comments|@example/);
    await status(f.next, 'EM_ANDAMENTO');
    await move(f.items[1], 'CONCLUIDO');
    await tasks.updateTask(
      id,
      {
        title: 'Checkout final',
        description: 'Descrição nova',
        priority: 'CRITICA',
        responsibleUserId: null,
        deadline: '2026-09-20',
        estimatedEffort: 13,
        actualEffort: 11
      },
      context()
    );
    await prisma.user.update({ where: { id: actorUserId }, data: { name: 'Nome alterado' } });
    await prisma.requirement.update({ where: { id: requirement.id }, data: { title: 'R2' } });
    await prisma.pullRequest.update({
      where: { id: pullRequest.id },
      data: { title: 'PR atual', state: 'closed' }
    });
    await prisma.issue.update({
      where: { id: issue.id },
      data: { title: 'Issue atual', state: 'closed', labels: [] }
    });
    await prisma.commit.updateMany({
      where: { id: { in: commits.map((c) => c.id) } },
      data: { message: 'Commit atual', authorName: 'Autor atual' }
    });
    expect(await sprints.getSprintTaskProjection(f.first.id)).toEqual(before);
    await prisma.taskCommit.deleteMany({ where: { taskId: id } });
    await prisma.taskIssue.deleteMany({ where: { taskId: id } });
    await prisma.task.update({ where: { id }, data: { requirementId: null, pullRequestId: null } });
    await prisma.requirement.delete({ where: { id: requirement.id } });
    await prisma.pullRequest.delete({ where: { id: pullRequest.id } });
    await prisma.issue.delete({ where: { id: issue.id } });
    await prisma.commit.deleteMany({ where: { id: { in: commits.map((c) => c.id) } } });
    await tasks.deleteTask(id, context());
    expect(
      (await sprints.getSprintTaskProjection(f.first.id)).tasks.find((t) => t.id === id)
    ).toEqual({ ...snapshot, currentTaskId: null });
  });

  it('rolls back all snapshots and closing/carry-over when capture fails midway', async () => {
    const f = await fixture();
    const projection = await import('../../src/modules/sprints/sprint-task.projection.js');
    const original = projection.buildClosingTaskSnapshot;
    let calls = 0;
    vi.spyOn(projection, 'buildClosingTaskSnapshot').mockImplementation((task) => {
      if (++calls === 2) throw new Error('Injected snapshot failure');
      return original(task);
    });
    const before = await prisma.sprintTask.findMany({ where: { sprintId: f.first.id } });
    await expect(status(f.first, 'CONCLUIDA')).rejects.toThrow('Injected snapshot failure');
    expect(await prisma.sprintTask.findMany({ where: { sprintId: f.first.id } })).toEqual(before);
    expect(await prisma.sprint.findUnique({ where: { id: f.first.id } })).toMatchObject({
      status: 'EM_ANDAMENTO',
      closedAt: null
    });
    expect(await prisma.task.count({ where: { sprintId: f.first.id } })).toBe(3);
    expect(await prisma.sprintTask.count({ where: { sprintId: f.next.id } })).toBe(0);
  });

  it('uses a single repeatable-read view when artifact metadata changes during closing', async () => {
    const f = await fixture();
    const pr = await createPullRequest(prisma, f.project.id, { title: 'Before close' });
    await prisma.task.update({ where: { id: f.items[0].id }, data: { pullRequestId: pr.id } });
    const { sprintRepository } =
      await import('../../src/modules/sprints/repositories/sprint.repository.js');
    await sprintRepository.transitionWithinSprintLock(f.first.id, f.project.id, async () => {
      // The closing transaction already read its logical snapshot; concurrent sync
      // can commit without extra artifact locks but must not change that snapshot.
      await prisma.pullRequest.update({ where: { id: pr.id }, data: { title: 'Concurrent sync' } });
      return { data: { status: 'CANCELADA' }, freezeAt: new Date() };
    });
    expect((await sprints.getSprintTaskProjection(f.first.id)).tasks[0].pullRequest.title).toBe(
      'Before close'
    );
    expect((await prisma.pullRequest.findUnique({ where: { id: pr.id } })).title).toBe(
      'Concurrent sync'
    );
  });

  it('keeps v1 partial snapshots explicit without hydrating v2 fields', async () => {
    const f = await fixture();
    await status(f.first, 'CONCLUIDA');
    await prisma.sprintTask.updateMany({
      where: { sprintId: f.first.id },
      data: {
        closingTaskSnapshot: {
          version: 1,
          id: f.items[0].id,
          title: 'Legacy title',
          priority: 'MEDIA',
          responsibleUserId: actorUserId,
          deadline: null,
          traceabilityCounts: { requirements: 0, pullRequests: 0, commits: 2, issues: 0 }
        }
      }
    });
    const result = await sprints.getSprintTaskProjection(f.first.id);
    expect(result.historicalLimitations).toContain('LEGACY_CLOSING_TASK_DETAILS_PARTIAL');
    expect(result.tasks[0]).toMatchObject({ snapshotVersion: 1, title: 'Legacy title' });
    for (const field of [
      'description',
      'responsibleDisplayName',
      'actualEffort',
      'createdAt',
      'requirement',
      'pullRequest',
      'commits',
      'issues'
    ])
      expect(result.tasks[0]).not.toHaveProperty(field);
  });
});
