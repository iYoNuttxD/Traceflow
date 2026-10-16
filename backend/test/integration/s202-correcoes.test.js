import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createProject, createTask } from '../fixtures/factories.js';

let prisma;
let service;
let kanban;
let createNotificationService;
let sequence = 0;

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ notificationService: service, createNotificationService } =
    await import('../../src/modules/notifications/notification.service.js'));
  ({ taskKanbanService: kanban } =
    await import('../../src/modules/tasks/services/task-kanban.service.js'));
  await cleanTestDatabase(prisma);
}, 60000);

afterEach(async () => cleanTestDatabase(prisma));

afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function person(projectId, { role = 'MEMBER', isActive = true } = {}) {
  sequence += 1;
  const user = await prisma.user.create({
    data: {
      name: `Pessoa correções S2-02 ${sequence}`,
      username: `s202corr${sequence}`,
      email: `s202-corr-${sequence}@example.invalid`
    }
  });
  if (projectId)
    await prisma.projectMembership.create({ data: { projectId, userId: user.id, role, isActive } });
  return user;
}

const audits = (userId) =>
  prisma.auditEvent.findMany({
    where: { action: 'NOTIFICATION_PREFERENCES_UPDATED', actorUserId: userId },
    orderBy: { id: 'asc' }
  });

function replay(events) {
  let state = {
    TASK_STATUS_CHANGED: true,
    TASK_OVERDUE: true,
    ISSUE_EVENT: true,
    PULL_REQUEST_EVENT: true
  };
  for (const event of events) {
    const changed = event.metadataJson.changedTypes.split(',');
    state = Object.fromEntries(
      Object.entries(state).map(([type, value]) => [type, changed.includes(type) ? !value : value])
    );
  }
  return state;
}

describe('S2-02 correções — PUT de preferências serializado (S202-A02)', () => {
  it('C4-01 H11: dez rodadas de dois primeiros PUT simultâneos têm auditoria coerente com o estado final', async () => {
    const outcomes = [];
    for (let round = 0; round < 10; round += 1) {
      const user = await person();
      await Promise.all([
        service.updatePreferences(user.id, {
          TASK_STATUS_CHANGED: false,
          TASK_OVERDUE: true,
          ISSUE_EVENT: true,
          PULL_REQUEST_EVENT: true
        }),
        service.updatePreferences(user.id, {
          TASK_STATUS_CHANGED: true,
          TASK_OVERDUE: false,
          ISSUE_EVENT: true,
          PULL_REQUEST_EVENT: true
        })
      ]);
      const final = (await service.preferences(user.id)).preferences;
      outcomes.push({ final, replayed: replay(await audits(user.id)) });
    }

    for (const { final, replayed } of outcomes) expect(replayed).toEqual(final);
  });

  it('C4-01 dois PUT simultâneos iguais geram uma auditoria', async () => {
    const user = await person();
    const choice = {
      TASK_STATUS_CHANGED: false,
      TASK_OVERDUE: true,
      ISSUE_EVENT: true,
      PULL_REQUEST_EVENT: true
    };

    await Promise.all([
      service.updatePreferences(user.id, choice),
      service.updatePreferences(user.id, choice)
    ]);

    expect(await audits(user.id)).toHaveLength(1);
  });

  it('C4-01 PUT sem mudança não audita nem regrava a preferência', async () => {
    const user = await person();
    const choice = {
      TASK_STATUS_CHANGED: false,
      TASK_OVERDUE: true,
      ISSUE_EVENT: true,
      PULL_REQUEST_EVENT: true
    };
    await service.updatePreferences(user.id, choice);
    const before = await prisma.notificationPreference.findMany({
      where: { userId: user.id },
      orderBy: { type: 'asc' }
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    await service.updatePreferences(user.id, choice);

    const after = await prisma.notificationPreference.findMany({
      where: { userId: user.id },
      orderBy: { type: 'asc' }
    });
    expect(after.map((row) => [row.type, row.updatedAt.getTime()])).toEqual(
      before.map((row) => [row.type, row.updatedAt.getTime()])
    );
    expect(await audits(user.id)).toHaveLength(1);
  });
});

const at = (iso) => new Date(iso);
const serviceAt = (iso) => createNotificationService({ clock: () => at(iso) });
const job = (now, overrides = {}) =>
  service.notifyOverdueTasks({
    now: at(now),
    timeZone: 'America/Sao_Paulo',
    dryRun: false,
    ...overrides
  });

async function overdueScenario(dueDate) {
  const project = await createProject(prisma);
  const responsible = await person(project.id);
  const task = await createTask(prisma, project.id, {
    responsibleUserId: responsible.id,
    deadline: at(`${dueDate}T00:00:00.000Z`)
  });
  return { project, responsible, task };
}

const overdueTo = (user) =>
  prisma.notification.findMany({ where: { recipientUserId: user.id, type: 'TASK_OVERDUE' } });

describe('S2-02 correções — religar o aviso de prazo não é retroativo (S202-A03)', () => {
  it('C5-01 H9: religar depois do corte não notifica o vencimento excluído', async () => {
    const { project, responsible } = await overdueScenario('2026-10-15');
    await serviceAt('2026-10-14T12:00:00.000Z').updatePreferences(responsible.id, {
      TASK_STATUS_CHANGED: true,
      TASK_OVERDUE: false,
      ISSUE_EVENT: true,
      PULL_REQUEST_EVENT: true
    });

    const whileOff = await job('2026-10-16T12:00:00.000Z', { projectId: project.id });
    await serviceAt('2026-10-17T12:00:00.000Z').updatePreferences(responsible.id, {
      TASK_STATUS_CHANGED: true,
      TASK_OVERDUE: true,
      ISSUE_EVENT: true,
      PULL_REQUEST_EVENT: true
    });
    const afterOn = await job('2026-10-17T13:00:00.000Z', { projectId: project.id });

    expect(whileOff.excluded.PREFERENCE_OFF).toBe(1);
    expect(afterOn).toMatchObject({ created: 0, excluded: { PREFERENCE_OFF: 1 } });
    expect(await overdueTo(responsible)).toHaveLength(0);
  });

  it('C5-02 desligar e religar antes do corte notifica no corte', async () => {
    const { project, responsible } = await overdueScenario('2026-10-15');
    await serviceAt('2026-10-14T12:00:00.000Z').updatePreferences(responsible.id, {
      TASK_STATUS_CHANGED: true,
      TASK_OVERDUE: false,
      ISSUE_EVENT: true,
      PULL_REQUEST_EVENT: true
    });
    await serviceAt('2026-10-15T12:00:00.000Z').updatePreferences(responsible.id, {
      TASK_STATUS_CHANGED: true,
      TASK_OVERDUE: true,
      ISSUE_EVENT: true,
      PULL_REQUEST_EVENT: true
    });

    const report = await job('2026-10-16T12:00:00.000Z', { projectId: project.id });

    expect(report.created).toBe(1);
  });

  it('C5-02 religar no instante exato do corte ainda notifica', async () => {
    const { project, responsible } = await overdueScenario('2026-10-15');
    await serviceAt('2026-10-14T12:00:00.000Z').updatePreferences(responsible.id, {
      TASK_STATUS_CHANGED: true,
      TASK_OVERDUE: false,
      ISSUE_EVENT: true,
      PULL_REQUEST_EVENT: true
    });
    await serviceAt('2026-10-16T03:00:00.000Z').updatePreferences(responsible.id, {
      TASK_STATUS_CHANGED: true,
      TASK_OVERDUE: true,
      ISSUE_EVENT: true,
      PULL_REQUEST_EVENT: true
    });

    const report = await job('2026-10-16T12:00:00.000Z', { projectId: project.id });

    expect(report.created).toBe(1);
  });

  it('C5-02 preferência nunca desligada, ou só a do outro tipo, notifica como antes', async () => {
    const { project, responsible } = await overdueScenario('2026-10-15');
    const other = await person(project.id);
    await createTask(prisma, project.id, {
      responsibleUserId: other.id,
      deadline: at('2026-10-15T00:00:00.000Z')
    });
    await serviceAt('2026-10-17T12:00:00.000Z').updatePreferences(other.id, {
      TASK_STATUS_CHANGED: false,
      TASK_OVERDUE: true,
      ISSUE_EVENT: true,
      PULL_REQUEST_EVENT: true
    });

    const report = await job('2026-10-17T13:00:00.000Z', { projectId: project.id });

    expect(report.created).toBe(2);
    expect(await overdueTo(responsible)).toHaveLength(1);
    expect(
      await prisma.notificationPreference.findMany({
        where: { userId: other.id, type: 'TASK_OVERDUE' }
      })
    ).toEqual([]);
  });

  it('C5-02 prazo novo com corte depois de religar notifica; o antigo continua excluído', async () => {
    const { project, responsible, task } = await overdueScenario('2026-10-15');
    const later = await createTask(prisma, project.id, {
      responsibleUserId: responsible.id,
      deadline: at('2026-10-17T00:00:00.000Z')
    });
    await serviceAt('2026-10-14T12:00:00.000Z').updatePreferences(responsible.id, {
      TASK_STATUS_CHANGED: true,
      TASK_OVERDUE: false,
      ISSUE_EVENT: true,
      PULL_REQUEST_EVENT: true
    });
    await serviceAt('2026-10-17T12:00:00.000Z').updatePreferences(responsible.id, {
      TASK_STATUS_CHANGED: true,
      TASK_OVERDUE: true,
      ISSUE_EVENT: true,
      PULL_REQUEST_EVENT: true
    });

    const report = await job('2026-10-18T12:00:00.000Z', { projectId: project.id });

    expect(report).toMatchObject({ created: 1, excluded: { PREFERENCE_OFF: 1 } });
    expect((await overdueTo(responsible)).map((row) => row.taskId)).toEqual([later.id]);
    expect(task.id).not.toBe(later.id);
  });

  it('C5-02 enabledAt só muda na passagem de desligada para ligada', async () => {
    const user = await person();
    const read = () =>
      prisma.notificationPreference.findUnique({
        where: { userId_type: { userId: user.id, type: 'TASK_OVERDUE' } }
      });

    await serviceAt('2026-10-14T12:00:00.000Z').updatePreferences(user.id, {
      TASK_STATUS_CHANGED: true,
      TASK_OVERDUE: false,
      ISSUE_EVENT: true,
      PULL_REQUEST_EVENT: true
    });
    const off = await read();
    await serviceAt('2026-10-15T12:00:00.000Z').updatePreferences(user.id, {
      TASK_STATUS_CHANGED: true,
      TASK_OVERDUE: true,
      ISSUE_EVENT: true,
      PULL_REQUEST_EVENT: true
    });
    const on = await read();
    await serviceAt('2026-10-16T12:00:00.000Z').updatePreferences(user.id, {
      TASK_STATUS_CHANGED: false,
      TASK_OVERDUE: true,
      ISSUE_EVENT: true,
      PULL_REQUEST_EVENT: true
    });
    const unchanged = await read();

    expect(off.enabledAt).toBeNull();
    expect(on.enabledAt.toISOString()).toBe('2026-10-15T12:00:00.000Z');
    expect(unchanged.enabledAt.toISOString()).toBe('2026-10-15T12:00:00.000Z');
  });
});

const restrict = (user, accountStatus) =>
  prisma.user.update({ where: { id: user.id }, data: { accountStatus } });
const moveBy = (actor, task, toStatus) =>
  kanban.moveTask(
    task.id,
    { toStatus },
    { actor: { id: actor.id, name: actor.name }, requestId: 's202-correcoes' }
  );
const statusNotificationsTo = (user) =>
  prisma.notification.count({ where: { recipientUserId: user.id, type: 'TASK_STATUS_CHANGED' } });

describe('S2-02 correções — contas restritas não recebem (S202-A04)', () => {
  it('C6-02 RF30: estado da conta × membership × preferência', async () => {
    const project = await createProject(prisma);
    const actor = await person(project.id, { role: 'MANAGER' });
    const rows = [];
    for (const accountStatus of ['ACTIVE', 'DEACTIVATED', 'DELETION_PENDING', 'ANONYMIZED'])
      for (const isActive of [true, false])
        for (const preference of [true, false]) {
          const responsible = await person(project.id, { isActive });
          await restrict(responsible, accountStatus);
          if (!preference)
            await prisma.notificationPreference.create({
              data: { userId: responsible.id, type: 'TASK_STATUS_CHANGED', enabled: false }
            });
          const task = await createTask(prisma, project.id, { responsibleUserId: responsible.id });
          await moveBy(actor, task, 'EM_ANDAMENTO');
          const expected = accountStatus === 'ACTIVE' && isActive && preference ? 1 : 0;
          rows.push([
            `${accountStatus}/${isActive}/${preference}`,
            await statusNotificationsTo(responsible),
            expected
          ]);
        }

    expect(rows.map(([label, actual]) => [label, actual])).toEqual(
      rows.map(([label, , expected]) => [label, expected])
    );
  });

  it('C6-02 RF30: reativar a conta não recupera o movimento anterior', async () => {
    const project = await createProject(prisma);
    const actor = await person(project.id, { role: 'MANAGER' });
    const responsible = await person(project.id);
    const task = await createTask(prisma, project.id, { responsibleUserId: responsible.id });
    await restrict(responsible, 'DEACTIVATED');

    await moveBy(actor, task, 'EM_ANDAMENTO');
    await restrict(responsible, 'ACTIVE');
    const afterReactivation = await statusNotificationsTo(responsible);
    await moveBy(actor, task, 'CONCLUIDO');

    expect(afterReactivation).toBe(0);
    expect(await statusNotificationsTo(responsible)).toBe(1);
  });

  it('C6-02 RF59: conta restrita conta em INACTIVE_ACCOUNT; reativar dentro da janela notifica na varredura seguinte', async () => {
    const { project, responsible } = await overdueScenario('2026-10-15');
    await restrict(responsible, 'DELETION_PENDING');

    const whileRestricted = await job('2026-10-16T12:00:00.000Z', { projectId: project.id });
    await restrict(responsible, 'ACTIVE');
    const afterReactivation = await job('2026-10-17T12:00:00.000Z', { projectId: project.id });

    expect(whileRestricted).toMatchObject({
      created: 0,
      eligible: 0,
      excluded: { INACTIVE_ACCOUNT: 1, INACTIVE_MEMBER: 0 }
    });
    expect(afterReactivation).toMatchObject({ created: 1, excluded: { INACTIVE_ACCOUNT: 0 } });
  });

  it('C6-02 RF59: a conta restrita vem antes da membership inativa e da preferência', async () => {
    const { project, responsible } = await overdueScenario('2026-10-15');
    await restrict(responsible, 'DEACTIVATED');
    await prisma.projectMembership.updateMany({
      where: { projectId: project.id, userId: responsible.id },
      data: { isActive: false }
    });
    await prisma.notificationPreference.create({
      data: { userId: responsible.id, type: 'TASK_OVERDUE', enabled: false }
    });

    const report = await job('2026-10-16T12:00:00.000Z', { projectId: project.id });

    expect(report.excluded).toEqual({
      NO_RESPONSIBLE: 0,
      INACTIVE_ACCOUNT: 1,
      INACTIVE_MEMBER: 0,
      PREFERENCE_OFF: 0
    });
  });
});
