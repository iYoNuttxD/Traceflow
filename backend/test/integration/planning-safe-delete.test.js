import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createProject, createTask, createSprint } from '../fixtures/factories.js';
let prisma, service, actorUserId;
const context = () => ({ actorUserId });
const start = (sprint) => service.updateSprintStatus(sprint.id, 'EM_ANDAMENTO', context());
const close = (sprint) => service.updateSprintStatus(sprint.id, 'CONCLUIDA', context());
beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ sprintService: service } = await import('../../src/modules/sprints/sprint.service.js'));
  await cleanTestDatabase(prisma);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await cleanTestDatabase(prisma);
});
afterAll(async () => prisma.$disconnect());
async function fixture() {
  actorUserId = (
    await prisma.user.create({
      data: {
        name: 'Delete QA',
        username: 'deleteqa',
        email: 'deleteqa@example.invalid',
        passwordHash: 'x'
      }
    })
  ).id;
  const project = await createProject(prisma);
  const milestone = await service.createMilestone(
    project.id,
    { title: 'Marco', dueDate: '2026-09-20' },
    context()
  );
  const sprint = await service.createSprint(
    project.id,
    { name: 'S1', startDate: '2026-09-01', endDate: '2026-09-05', milestoneId: milestone.id },
    context()
  );
  const task = await createTask(prisma, project.id, { estimatedEffort: 5 });
  await service.replaceTasks(sprint.id, [task.id], context());
  return { project, milestone, sprint, task };
}
describe('FIX-03 optional Milestone', () => {
  it.each([undefined, null])(
    'creates and runs Sprint without Milestone (%s)',
    async (milestoneId) => {
      const { project } = await fixture();
      const sprint = await service.createSprint(
        project.id,
        {
          name: 'Independent',
          startDate: '2026-09-05',
          endDate: '2026-09-12',
          ...(milestoneId === undefined ? {} : { milestoneId })
        },
        context()
      );
      expect(sprint.milestoneId).toBeNull();
      const next = await service.createSprint(
        project.id,
        { name: 'Next', startDate: '2026-09-12', endDate: '2026-09-19' },
        context()
      );
      const task = await createTask(prisma, project.id);
      await service.replaceTasks(sprint.id, [task.id], context());
      await start(sprint);
      expect((await close(sprint)).carryOver.destinationSprintId).toBe(next.id);
      expect(
        (await service.getSchedule(project.id)).sprints.find((s) => s.id === sprint.id)
      ).toMatchObject({ milestoneId: null });
    }
  );
  it('attaches and detaches while open and still rejects terminal changes', async () => {
    const { sprint, milestone } = await fixture();
    expect(
      (await service.updateSprint(sprint.id, { milestoneId: null }, context())).milestoneId
    ).toBeNull();
    expect(
      (await service.updateSprint(sprint.id, { milestoneId: milestone.id }, context())).milestoneId
    ).toBe(milestone.id);
    await start(sprint);
    await close(sprint);
    await expect(
      service.updateSprint(sprint.id, { milestoneId: null }, context())
    ).rejects.toMatchObject({ code: 'SPRINT_LOCKED' });
  });
});
describe('FIX-03 safe Sprint deletion', () => {
  it.each(['PLANEJADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'])(
    'soft deletes %s without destroying history or carrying work over',
    async (targetStatus) => {
      const { project, sprint, task } = await fixture();
      if (targetStatus === 'EM_ANDAMENTO' || targetStatus === 'CONCLUIDA') await start(sprint);
      if (targetStatus === 'CONCLUIDA') {
        await prisma.task.update({ where: { id: task.id }, data: { status: 'CONCLUIDO' } });
        await close(sprint);
      }
      if (targetStatus === 'CANCELADA')
        await service.updateSprintStatus(sprint.id, 'CANCELADA', context());
      const terminal = ['CONCLUIDA', 'CANCELADA'].includes(targetStatus);
      const before = await prisma.sprintTask.findMany({ where: { sprintId: sprint.id } });
      const oldHistory = await prisma.taskHistoryEntry.findMany({ where: { taskId: task.id } });
      const next = await createSprint(prisma, project.id, {
        name: 'Next',
        startDate: sprint.endDate,
        endDate: new Date('2026-09-12')
      });
      const result = await service.deleteSprint(sprint.id, context());
      expect(result.sprint.deletedAt).toBeInstanceOf(Date);
      expect(await prisma.sprint.findUnique({ where: { id: sprint.id } })).toMatchObject({
        status: targetStatus,
        deletedById: actorUserId
      });
      expect((await prisma.task.findUnique({ where: { id: task.id } })).sprintId).toBeNull();
      expect(await prisma.task.count({ where: { sprintId: next.id } })).toBe(0);
      const after = await prisma.sprintTask.findMany({ where: { sprintId: sprint.id } });
      expect(after).toHaveLength(before.length);
      if (terminal) expect(after).toEqual(before);
      const history = await prisma.taskHistoryEntry.findMany({ where: { taskId: task.id } });
      for (const entry of oldHistory) expect(history).toContainEqual(entry);
      if (targetStatus !== 'CANCELADA')
        expect(history.at(-1)).toMatchObject({
          field: 'SPRINT',
          fromValue: String(sprint.id),
          toValue: null,
          actorUserId
        });
      expect((await service.findSprintsByProject(project.id)).map((s) => s.id)).not.toContain(
        sprint.id
      );
      expect((await service.getSchedule(project.id)).sprints.map((s) => s.id)).not.toContain(
        sprint.id
      );
      await expect(service.getSprintById(sprint.id)).rejects.toMatchObject({
        code: 'SPRINT_NOT_FOUND'
      });
      await expect(service.attachTaskToSprint(sprint.id, task.id, context())).rejects.toMatchObject(
        { code: 'SPRINT_NOT_FOUND' }
      );
      await expect(service.deleteSprint(sprint.id, context())).rejects.toMatchObject({
        code: 'SPRINT_ALREADY_DELETED'
      });
      expect(await prisma.taskHistoryEntry.count({ where: { taskId: task.id } })).toBe(
        history.length
      );
    }
  );
  it('ignores a deleted planned destination and frees the deleted window and active slot', async () => {
    const { project, sprint } = await fixture();
    const next = await createSprint(prisma, project.id, {
      name: 'Deleted destination',
      startDate: sprint.endDate,
      endDate: new Date('2026-09-12')
    });
    await service.deleteSprint(next.id, context());
    await start(sprint);
    expect(await close(sprint)).toMatchObject({ carryOver: null, returnedToBacklog: 1 });
    await service.deleteSprint(sprint.id, context());
    const replacement = await service.createSprint(
      project.id,
      { name: 'Replacement', startDate: '2026-09-01', endDate: '2026-09-12' },
      context()
    );
    await start(replacement);
    await service.deleteSprint(replacement.id, context());
    const another = await service.createSprint(
      project.id,
      { name: 'Another', startDate: '2026-09-01', endDate: '2026-09-12' },
      context()
    );
    expect((await start(another)).sprint.status).toBe('EM_ANDAMENTO');
  });
  it('rolls back tombstone, pointer and history on audit failure', async () => {
    const { sprint, task } = await fixture();
    const { auditRepository } = await import('../../src/modules/audit/audit.repository.js');
    vi.spyOn(auditRepository, 'create').mockRejectedValue(new Error('Delete audit failure'));
    await expect(service.deleteSprint(sprint.id, context())).rejects.toThrow(
      'Delete audit failure'
    );
    expect((await prisma.sprint.findUnique({ where: { id: sprint.id } })).deletedAt).toBeNull();
    expect((await prisma.task.findUnique({ where: { id: task.id } })).sprintId).toBe(sprint.id);
    expect(
      await prisma.taskHistoryEntry.count({
        where: { taskId: task.id, fromValue: String(sprint.id) }
      })
    ).toBe(0);
  });
});
describe('FIX-03 safe Milestone deletion', () => {
  it.each(['empty', 'open', 'closed'])(
    'preserves %s relationships and excludes tombstone from current selectors',
    async (kind) => {
      const { project, sprint, milestone } = await fixture();
      if (kind === 'empty') await service.updateSprint(sprint.id, { milestoneId: null }, context());
      if (kind === 'closed') {
        await start(sprint);
        await close(sprint);
      }
      const before = await prisma.sprint.findUnique({ where: { id: sprint.id } });
      const memberships = await prisma.sprintTask.findMany({ where: { sprintId: sprint.id } });
      await service.deleteMilestone(milestone.id, context());
      expect(await prisma.milestone.findUnique({ where: { id: milestone.id } })).toMatchObject({
        deletedAt: expect.any(Date),
        deletedById: actorUserId
      });
      expect(await prisma.sprint.findUnique({ where: { id: sprint.id } })).toEqual(before);
      expect(await prisma.sprintTask.findMany({ where: { sprintId: sprint.id } })).toEqual(
        memberships
      );
      expect(await service.findMilestonesByProject(project.id)).toEqual([]);
      if (kind !== 'empty')
        expect((await service.getSprintById(sprint.id)).milestone).toMatchObject({
          id: milestone.id,
          title: 'Marco',
          deletedAt: expect.any(Date)
        });
      await expect(
        service.createSprint(
          project.id,
          {
            name: 'Invalid',
            startDate: '2026-09-05',
            endDate: '2026-09-12',
            milestoneId: milestone.id
          },
          context()
        )
      ).rejects.toMatchObject({ code: 'MILESTONE_NOT_FOUND' });
      await expect(service.deleteMilestone(milestone.id, context())).rejects.toMatchObject({
        code: 'MILESTONE_ALREADY_DELETED'
      });
      if (kind === 'open') {
        await service.updateSprint(
          sprint.id,
          { name: 'Renamed', milestoneId: milestone.id },
          context()
        );
        await start(sprint);
        expect((await close(sprint)).milestoneCompleted).toBeNull();
      }
    }
  );
});
