import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createProject, createTask } from '../fixtures/factories.js';

let prisma;
let kanban;
let notifications;
let service;
let policy;
let sequence = 0;

const NOW = new Date('2026-10-20T12:00:00.000Z');
const TIME_ZONE = 'America/Sao_Paulo';
const IN_WINDOW = new Date('2026-10-15T00:00:00.000Z');
const OUTSIDE_WINDOW = new Date('2026-10-01T00:00:00.000Z');

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ taskKanbanService: kanban } =
    await import('../../src/modules/tasks/services/task-kanban.service.js'));
  ({ notificationRepository: notifications } =
    await import('../../src/modules/notifications/notification.repository.js'));
  ({ notificationService: service } =
    await import('../../src/modules/notifications/notification.service.js'));
  policy = await import('../../src/modules/notifications/notification.policy.js');
  await cleanTestDatabase(prisma);
}, 60000);

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function person(projectId, { role = 'MEMBER', isActive = true } = {}) {
  sequence += 1;
  const user = await prisma.user.create({
    data: {
      name: `Pessoa S2-02 ${sequence}`,
      username: `s202int${sequence}`,
      email: `s202-int-${sequence}@example.invalid`
    }
  });
  if (projectId)
    await prisma.projectMembership.create({
      data: { projectId, userId: user.id, role, isActive }
    });
  return user;
}

async function scenario() {
  const project = await createProject(prisma);
  const actor = await person(project.id, { role: 'MANAGER' });
  const responsible = await person(project.id);
  return { project, actor, responsible };
}

const move = (task, toStatus, actor) =>
  kanban.moveTask(task.id, { toStatus }, { actor: { id: actor.id, name: actor.name } });

const runJob = (overrides = {}) =>
  service.notifyOverdueTasks({
    now: NOW,
    timeZone: TIME_ZONE,
    lookbackDays: 7,
    dryRun: false,
    ...overrides
  });

const ofType = (type, where = {}) => prisma.notification.findMany({ where: { type, ...where } });

describe('S2-02 RF30: mudança de status (C1, D3, D4)', () => {
  it('N1 mover a tarefa de outra pessoa notifica o responsável com origem, destino, ator e título', async () => {
    const { project, actor, responsible } = await scenario();
    const task = await createTask(prisma, project.id, {
      title: 'Revisar contrato de API',
      responsibleUserId: responsible.id
    });

    const { movement } = await move(task, 'EM_ANDAMENTO', actor);

    const rows = await prisma.notification.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      recipientUserId: responsible.id,
      projectId: project.id,
      taskId: task.id,
      type: 'TASK_STATUS_CHANGED',
      dedupeKey: `TASK_STATUS_CHANGED:movement:${movement.id}`,
      taskTitle: 'Revisar contrato de API',
      fromStatus: 'A_FAZER',
      toStatus: 'EM_ANDAMENTO',
      actorUserId: actor.id,
      dueDate: null,
      readAt: null
    });
  });

  it('N2 o responsável que move a própria tarefa não é notificado', async () => {
    const { project, responsible } = await scenario();
    const task = await createTask(prisma, project.id, { responsibleUserId: responsible.id });

    await move(task, 'EM_ANDAMENTO', responsible);

    expect(await prisma.notification.count()).toBe(0);
    expect(await prisma.taskMovement.count({ where: { taskId: task.id } })).toBe(1);
  });

  it('N3 sem responsável, ou com responsável sem membership ativa, nada nasce', async () => {
    const { project, actor } = await scenario();
    const inactive = await person(project.id, { isActive: false });
    const outsider = await person();
    const tasks = [
      await createTask(prisma, project.id),
      await createTask(prisma, project.id, { responsibleUserId: inactive.id }),
      await createTask(prisma, project.id, { responsibleUserId: outsider.id })
    ];

    for (const task of tasks) await move(task, 'EM_ANDAMENTO', actor);

    expect(await prisma.notification.count()).toBe(0);
    expect(await prisma.taskMovement.count({ where: { projectId: project.id } })).toBe(3);
  });

  it('N4 falha ao gravar a notificação desfaz o movimento, o histórico e o status (C4)', async () => {
    const { project, actor, responsible } = await scenario();
    const task = await createTask(prisma, project.id, { responsibleUserId: responsible.id });
    vi.spyOn(notifications, 'createStatusChangeNotification').mockRejectedValueOnce(
      new Error('falha injetada')
    );

    await expect(move(task, 'EM_ANDAMENTO', actor)).rejects.toThrow();

    expect((await prisma.task.findUnique({ where: { id: task.id } })).status).toBe('A_FAZER');
    expect(await prisma.taskMovement.count({ where: { taskId: task.id } })).toBe(0);
    expect(await prisma.taskHistoryEntry.count({ where: { taskId: task.id } })).toBe(0);
    expect(await prisma.notification.count()).toBe(0);
  });

  it('N5 duas mudanças concorrentes geram uma só notificação, a do movimento vencedor (C4)', async () => {
    const { project, actor, responsible } = await scenario();
    const task = await createTask(prisma, project.id, { responsibleUserId: responsible.id });

    const results = await Promise.allSettled([
      move(task, 'EM_ANDAMENTO', actor),
      move(task, 'CONCLUIDO', actor)
    ]);

    const won = results.filter((result) => result.status === 'fulfilled');
    expect(won).toHaveLength(1);
    const rows = await prisma.notification.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].dedupeKey).toBe(`TASK_STATUS_CHANGED:movement:${won[0].value.movement.id}`);
    expect(await prisma.taskMovement.count({ where: { taskId: task.id } })).toBe(1);
  });

  it('N6 A→B→A gera duas notificações distintas, sem duplicar nenhuma', async () => {
    const { project, actor, responsible } = await scenario();
    const task = await createTask(prisma, project.id, { responsibleUserId: responsible.id });

    await move(task, 'EM_ANDAMENTO', actor);
    await move(await prisma.task.findUnique({ where: { id: task.id } }), 'A_FAZER', actor);

    const rows = await prisma.notification.findMany({ orderBy: { id: 'asc' } });
    expect(rows.map((row) => [row.fromStatus, row.toStatus])).toEqual([
      ['A_FAZER', 'EM_ANDAMENTO'],
      ['EM_ANDAMENTO', 'A_FAZER']
    ]);
    expect(new Set(rows.map((row) => row.dedupeKey)).size).toBe(2);
  });
});

describe('S2-02 RF59: vencimento pelo job (C2, D5, D6)', () => {
  it('N7 cria uma notificação por tarefa vencida e nada numa segunda execução', async () => {
    const { project, responsible } = await scenario();
    const task = await createTask(prisma, project.id, {
      title: 'Publicar relatório',
      responsibleUserId: responsible.id,
      deadline: IN_WINDOW
    });

    const first = await runJob();
    const second = await runJob();

    expect(first).toMatchObject({ eligible: 1, created: 1, alreadyNotified: 0, failed: 0 });
    expect(second).toMatchObject({ eligible: 1, created: 0, alreadyNotified: 1, failed: 0 });
    const rows = await ofType('TASK_OVERDUE');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      recipientUserId: responsible.id,
      projectId: project.id,
      taskId: task.id,
      dedupeKey: `TASK_OVERDUE:${task.id}:2026-10-15`,
      taskTitle: 'Publicar relatório',
      actorUserId: null,
      fromStatus: null,
      toStatus: null
    });
    expect(rows[0].dueDate.toISOString().slice(0, 10)).toBe('2026-10-15');
  });

  it('N8 dois jobs simultâneos não duplicam', async () => {
    const { project, responsible } = await scenario();
    await createTask(prisma, project.id, {
      responsibleUserId: responsible.id,
      deadline: IN_WINDOW
    });

    const reports = await Promise.all([runJob(), runJob()]);

    expect(reports.reduce((sum, report) => sum + report.created, 0)).toBe(1);
    expect(await prisma.notification.count()).toBe(1);
  });

  it('N9 reabrir e deixar vencida de novo, com o mesmo prazo, não repete', async () => {
    const { project, actor, responsible } = await scenario();
    const task = await createTask(prisma, project.id, {
      responsibleUserId: responsible.id,
      deadline: IN_WINDOW
    });
    await runJob();

    await move(task, 'CONCLUIDO', actor);
    await move(await prisma.task.findUnique({ where: { id: task.id } }), 'EM_ANDAMENTO', actor);
    await runJob();

    expect(await ofType('TASK_OVERDUE')).toHaveLength(1);
    expect(await ofType('TASK_STATUS_CHANGED')).toHaveLength(2);
  });

  it('N10 mudar o prazo para outra data que vence gera outra notificação', async () => {
    const { project, responsible } = await scenario();
    const task = await createTask(prisma, project.id, {
      responsibleUserId: responsible.id,
      deadline: IN_WINDOW
    });
    await runJob();

    await prisma.task.update({
      where: { id: task.id },
      data: { deadline: new Date('2026-10-17T00:00:00.000Z') }
    });
    await runJob();

    const rows = await ofType('TASK_OVERDUE');
    expect(rows.map((row) => row.dedupeKey).sort()).toEqual([
      `TASK_OVERDUE:${task.id}:2026-10-15`,
      `TASK_OVERDUE:${task.id}:2026-10-17`
    ]);
  });

  it('N11 trocar o responsável de uma tarefa vencida notifica o novo', async () => {
    const { project, responsible } = await scenario();
    const successor = await person(project.id);
    const task = await createTask(prisma, project.id, {
      responsibleUserId: responsible.id,
      deadline: IN_WINDOW
    });
    await runJob();

    await prisma.task.update({ where: { id: task.id }, data: { responsibleUserId: successor.id } });
    await runJob();

    const rows = await ofType('TASK_OVERDUE');
    expect(rows.map((row) => row.recipientUserId).sort((a, b) => a - b)).toEqual([
      responsible.id,
      successor.id
    ]);
  });

  it('N12 tarefa vencida fora da janela não gera notificação e é contada à parte', async () => {
    const { project, responsible } = await scenario();
    await createTask(prisma, project.id, {
      responsibleUserId: responsible.id,
      deadline: OUTSIDE_WINDOW
    });

    const report = await runJob();

    expect(report.excluded.OUTSIDE_WINDOW).toBe(1);
    expect(report.created).toBe(0);
    expect(await prisma.notification.count()).toBe(0);
  });

  it('N13 preferência desligada impede a criação nos dois tipos', async () => {
    const { project, actor, responsible } = await scenario();
    await prisma.notificationPreference.createMany({
      data: [
        { userId: responsible.id, type: 'TASK_STATUS_CHANGED', enabled: false },
        { userId: responsible.id, type: 'TASK_OVERDUE', enabled: false }
      ]
    });
    const task = await createTask(prisma, project.id, {
      responsibleUserId: responsible.id,
      deadline: IN_WINDOW
    });

    await move(task, 'EM_ANDAMENTO', actor);
    const report = await runJob();

    expect(report.excluded.PREFERENCE_OFF).toBe(1);
    expect(await prisma.notification.count()).toBe(0);
  });

  it('N14 projeto excluído não entra na varredura', async () => {
    const { project, responsible } = await scenario();
    await createTask(prisma, project.id, {
      responsibleUserId: responsible.id,
      deadline: IN_WINDOW
    });
    await prisma.project.update({ where: { id: project.id }, data: { deletedAt: NOW } });

    const report = await runJob();

    expect(report.projects).toBe(0);
    expect(await prisma.notification.count()).toBe(0);
  });

  it('o dry-run não grava e informa o que criaria', async () => {
    const { project, responsible } = await scenario();
    await createTask(prisma, project.id, {
      responsibleUserId: responsible.id,
      deadline: IN_WINDOW
    });

    const report = await runJob({ dryRun: true });

    expect(report).toMatchObject({ dryRun: true, eligible: 1, created: 0, wouldCreate: 1 });
    expect(await prisma.notification.count()).toBe(0);
  });
});

describe('S2-02 métrica oficial (C7, D16)', () => {
  it('M1 RF30: cobertura de 100% sobre os elegíveis, com uma exclusão de cada motivo', async () => {
    const { project, actor, responsible } = await scenario();
    const inactive = await person(project.id, { isActive: false });
    const restricted = await person(project.id);
    await prisma.user.update({
      where: { id: restricted.id },
      data: { accountStatus: 'DEACTIVATED' }
    });
    const optedOut = await person(project.id);
    await prisma.notificationPreference.create({
      data: { userId: optedOut.id, type: 'TASK_STATUS_CHANGED', enabled: false }
    });
    const eligibleTasks = [];
    for (let index = 0; index < 5; index += 1)
      eligibleTasks.push(
        await createTask(prisma, project.id, { responsibleUserId: responsible.id })
      );
    const excludedMoves = [
      [await createTask(prisma, project.id), actor],
      [await createTask(prisma, project.id, { responsibleUserId: inactive.id }), actor],
      [await createTask(prisma, project.id, { responsibleUserId: restricted.id }), actor],
      [await createTask(prisma, project.id, { responsibleUserId: responsible.id }), responsible],
      [await createTask(prisma, project.id, { responsibleUserId: optedOut.id }), actor]
    ];
    const spy = vi.spyOn(notifications, 'createStatusChangeNotification');

    const movementIds = [];
    for (const task of eligibleTasks)
      movementIds.push((await move(task, 'EM_ANDAMENTO', actor)).movement.id);
    for (const [task, who] of excludedMoves) await move(task, 'EM_ANDAMENTO', who);

    const outcomes = await Promise.all(spy.mock.results.map((result) => result.value));
    const occurred = outcomes.length;
    const exclusions = outcomes.filter((item) => item.outcome !== 'CREATED');
    const eligible = occurred - exclusions.length;
    const rows = await prisma.notification.findMany({ orderBy: { id: 'asc' } });
    const delivered = rows.filter(
      (row, index) =>
        row.recipientUserId === responsible.id &&
        row.taskId === eligibleTasks[index].id &&
        row.fromStatus === 'A_FAZER' &&
        row.toStatus === 'EM_ANDAMENTO' &&
        row.actorUserId === actor.id &&
        row.dedupeKey === `TASK_STATUS_CHANGED:movement:${movementIds[index]}` &&
        policy.notificationLink(row.projectId, row.taskId) ===
          `/projects/${project.id}/kanban?task=${eligibleTasks[index].id}`
    ).length;

    process.stdout.write(
      `M1 ${JSON.stringify({ occurred, eligible, delivered, exclusions: exclusions.map((item) => item.outcome).sort() })}\n`
    );
    expect(occurred).toBe(10);
    expect(eligible).toBe(5);
    expect(rows).toHaveLength(5);
    expect(policy.notificationCoverage({ delivered, eligible })).toBe(100);
    expect(exclusions.map((item) => item.outcome).sort()).toEqual([
      'INACTIVE_ACCOUNT',
      'INACTIVE_MEMBER',
      'NO_RESPONSIBLE',
      'PREFERENCE_OFF',
      'SELF_CHANGE'
    ]);
  });

  it('M2 RF59: cobertura de 100% sobre os elegíveis, com uma exclusão de cada motivo', async () => {
    const { project, responsible } = await scenario();
    const inactive = await person(project.id, { isActive: false });
    const restricted = await person(project.id);
    await prisma.user.update({
      where: { id: restricted.id },
      data: { accountStatus: 'DEACTIVATED' }
    });
    const optedOut = await person(project.id);
    await prisma.notificationPreference.create({
      data: { userId: optedOut.id, type: 'TASK_OVERDUE', enabled: false }
    });
    const eligibleTasks = [];
    for (const day of ['13', '15', '19'])
      eligibleTasks.push(
        await createTask(prisma, project.id, {
          responsibleUserId: responsible.id,
          deadline: new Date(`2026-10-${day}T00:00:00.000Z`)
        })
      );
    await createTask(prisma, project.id, { deadline: IN_WINDOW });
    await createTask(prisma, project.id, { responsibleUserId: inactive.id, deadline: IN_WINDOW });
    await createTask(prisma, project.id, {
      responsibleUserId: restricted.id,
      deadline: IN_WINDOW
    });
    await createTask(prisma, project.id, { responsibleUserId: optedOut.id, deadline: IN_WINDOW });
    await createTask(prisma, project.id, {
      responsibleUserId: responsible.id,
      deadline: OUTSIDE_WINDOW
    });
    await createTask(prisma, project.id, {
      responsibleUserId: responsible.id,
      deadline: IN_WINDOW,
      status: 'CONCLUIDO'
    });
    await createTask(prisma, project.id, {
      responsibleUserId: responsible.id,
      deadline: new Date('2026-10-20T00:00:00.000Z')
    });

    const report = await runJob();

    const rows = await ofType('TASK_OVERDUE');
    const delivered = rows.filter((row) => {
      const task = eligibleTasks.find((item) => item.id === row.taskId);
      return (
        task &&
        row.recipientUserId === responsible.id &&
        row.dueDate.toISOString().slice(0, 10) === task.deadline.toISOString().slice(0, 10)
      );
    }).length;
    process.stdout.write(
      `M2 ${JSON.stringify({ eligible: report.eligible, created: report.created, delivered, excluded: report.excluded })}\n`
    );
    expect(report).toMatchObject({
      eligible: 3,
      created: 3,
      failed: 0,
      excluded: {
        OUTSIDE_WINDOW: 1,
        NO_RESPONSIBLE: 1,
        INACTIVE_ACCOUNT: 1,
        INACTIVE_MEMBER: 1,
        PREFERENCE_OFF: 1
      }
    });
    expect(policy.notificationCoverage({ delivered, eligible: report.eligible })).toBe(100);
  });
});
