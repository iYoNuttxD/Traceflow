// RF10: migration e repositories contra MySQL real.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createMilestone, createProject, createSprint, createTask } from '../fixtures/factories.js';

let prisma;
let sprintRepository;
let milestoneRepository;
let testDatabaseUrl;

beforeAll(async () => {
  testDatabaseUrl = configureTestDatabaseEnvironment();
  deployTestMigrations(testDatabaseUrl);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ sprintRepository } =
    await import('../../src/modules/sprints/repositories/sprint.repository.js'));
  ({ milestoneRepository } =
    await import('../../src/modules/sprints/repositories/milestone.repository.js'));
  await cleanTestDatabase(prisma);
});
afterEach(() => cleanTestDatabase(prisma));
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

describe('migration add_sprint_milestone_schedule', () => {
  it('e idempotente: reaplicar em banco ja migrado nao falha', () => {
    expect(() => deployTestMigrations(testDatabaseUrl)).not.toThrow();
  });

  it('criou as tabelas Sprint e Milestone', async () => {
    await expect(prisma.sprint.count()).resolves.toBe(0);
    await expect(prisma.milestone.count()).resolves.toBe(0);
  });

  it('preservou os valores existentes do enum TaskHistoryField', async () => {
    const project = await createProject(prisma);
    const task = await createTask(prisma, project.id);
    const user = await prisma.user.create({
      data: { name: 'Ator', email: `ator-${task.id}@example.invalid`, passwordHash: 'x' }
    });

    for (const field of ['STATUS', 'DEADLINE', 'RESPONSIBLE', 'PRIORITY', 'SPRINT']) {
      await prisma.taskHistoryEntry.create({
        data: {
          projectId: project.id,
          taskId: task.id,
          actorUserId: user.id,
          field,
          fromValue: null,
          toValue: '1'
        }
      });
    }
    const stored = await prisma.taskHistoryEntry.findMany({ select: { field: true } });
    expect(stored.map((entry) => entry.field).sort()).toEqual([
      'DEADLINE',
      'PRIORITY',
      'RESPONSIBLE',
      'SPRINT',
      'STATUS'
    ]);
  });

  // Antes deste ajuste o teste fixava o comportamento oposto: `@db.Date` truncava
  // a hora e a assercao guardava essa perda como se fosse contrato. Preservar o
  // instante e a regra (ADR-010 D05) — 23:59:59 do dia 14 nao e meia-noite do 14.
  it('preserva o instante exato das datas de cronograma', async () => {
    const project = await createProject(prisma);
    const sprint = await createSprint(prisma, project.id, {
      startDate: new Date('2026-08-01T18:45:30.000Z'),
      endDate: new Date('2026-08-14T23:59:59.000Z')
    });
    const stored = await prisma.sprint.findUnique({ where: { id: sprint.id } });
    expect(stored.startDate.toISOString()).toBe('2026-08-01T18:45:30.000Z');
    expect(stored.endDate.toISOString()).toBe('2026-08-14T23:59:59.000Z');
  });
});

describe('integridade no banco', () => {
  it('aplica a unicidade de nome por projeto', async () => {
    const project = await createProject(prisma);
    await createSprint(prisma, project.id, { name: 'Sprint 1' });
    await expect(createSprint(prisma, project.id, { name: 'Sprint 1' })).rejects.toMatchObject({
      code: 'P2002'
    });
  });

  it('aceita o mesmo nome em projetos diferentes', async () => {
    const first = await createProject(prisma);
    const second = await createProject(prisma);
    await createSprint(prisma, first.id, { name: 'Sprint 1' });
    await expect(createSprint(prisma, second.id, { name: 'Sprint 1' })).resolves.toBeDefined();
  });

  it('SetNull na FK e rede de seguranca: exclusao direta nao apaga a tarefa', async () => {
    const project = await createProject(prisma);
    const sprint = await createSprint(prisma, project.id);
    const task = await createTask(prisma, project.id, { sprintId: sprint.id });

    await prisma.sprint.delete({ where: { id: sprint.id } });
    const stored = await prisma.task.findUnique({ where: { id: task.id } });
    expect(stored).not.toBeNull();
    expect(stored.sprintId).toBeNull();
  });

  it('exclusao de projeto remove sprints e marcos em cascata', async () => {
    const project = await createProject(prisma);
    await createSprint(prisma, project.id);
    await createMilestone(prisma, project.id);

    await prisma.projectMembership.deleteMany({ where: { projectId: project.id } });
    await prisma.project.delete({ where: { id: project.id } });
    expect(await prisma.sprint.count()).toBe(0);
    expect(await prisma.milestone.count()).toBe(0);
  });
});

describe('transacoes dos repositories', () => {
  const auditEvent = (projectId, sprintId, actorUserId) => ({
    actorUserId,
    actorType: 'USER',
    projectId,
    action: 'SPRINT_TASKS_REPLACED',
    resourceType: 'Sprint',
    resourceId: String(sprintId),
    result: 'SUCCESS',
    retentionUntil: new Date('2027-01-01T00:00:00.000Z')
  });

  const planoDeEntrada = (project, sprint, task, actorUserId) => () => ({
    close: [],
    open: [
      {
        id: null,
        taskId: task.id,
        taskTitleSnapshot: task.title,
        addedAt: new Date('2026-08-02T10:00:00.000Z'),
        addedAfterStart: false,
        carriedFromSprintId: null
      }
    ],
    detachTaskIds: [],
    attachTaskIds: [task.id],
    historyEntries: [
      {
        projectId: project.id,
        taskId: task.id,
        actorUserId,
        field: 'SPRINT',
        fromValue: null,
        toValue: String(sprint.id)
      }
    ],
    auditEvent: auditEvent(project.id, sprint.id, actorUserId)
  });

  it('a mutacao de escopo grava participacao, ponteiro, historico e auditoria juntos', async () => {
    const project = await createProject(prisma);
    const sprint = await createSprint(prisma, project.id);
    const task = await createTask(prisma, project.id);
    const user = await prisma.user.create({
      data: { name: 'Ator', email: `ator-tx-${task.id}@example.invalid`, passwordHash: 'x' }
    });

    await sprintRepository.mutateScopeWithinSprintLock(
      sprint.id,
      [task.id],
      planoDeEntrada(project, sprint, task, user.id)
    );

    expect(await prisma.sprintTask.count({ where: { sprintId: sprint.id } })).toBe(1);
    expect((await prisma.task.findUnique({ where: { id: task.id } })).sprintId).toBe(sprint.id);
    expect(await prisma.taskHistoryEntry.count({ where: { field: 'SPRINT' } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: 'SPRINT_TASKS_REPLACED' } })).toBe(1);
  });

  // A participacao entra na mesma transacao do vinculo: se a auditoria falhar,
  // nao pode sobrar registro historico de uma associacao que nunca existiu.
  it('falha na auditoria desfaz participacao, vinculo e historico', async () => {
    const project = await createProject(prisma);
    const sprint = await createSprint(prisma, project.id);
    const task = await createTask(prisma, project.id);

    await expect(
      sprintRepository.mutateScopeWithinSprintLock(
        sprint.id,
        [task.id],
        // actorUserId inexistente viola a FK e deve derrubar a transacao inteira.
        planoDeEntrada(project, sprint, task, 999999)
      )
    ).rejects.toBeDefined();

    expect(await prisma.sprintTask.count()).toBe(0);
    expect((await prisma.task.findUnique({ where: { id: task.id } })).sprintId).toBeNull();
    expect(await prisma.taskHistoryEntry.count({ where: { field: 'SPRINT' } })).toBe(0);
    expect(await prisma.auditEvent.count()).toBe(0);
  });

  it('findByIdInProject nao devolve registro de outro projeto', async () => {
    const first = await createProject(prisma);
    const second = await createProject(prisma);
    const sprint = await createSprint(prisma, first.id);
    const milestone = await createMilestone(prisma, first.id);

    expect(await sprintRepository.findByIdInProject(sprint.id, second.id)).toBeNull();
    expect(await sprintRepository.findByIdInProject(sprint.id, first.id)).not.toBeNull();
    expect(await milestoneRepository.findByIdInProject(milestone.id, second.id)).toBeNull();
    expect(await milestoneRepository.findByIdInProject(milestone.id, first.id)).not.toBeNull();
  });
});
