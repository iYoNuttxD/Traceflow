import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createIssue, createProject, createTask } from '../fixtures/factories.js';

let prisma;
let kanban;
let notificationService;
let createGithubEventNotificationService;
let sequence = 0;

const NOW = new Date('2026-10-20T12:00:00.000Z');
const TIME_ZONE = 'America/Sao_Paulo';
const DAY = 86_400_000;

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ taskKanbanService: kanban } =
    await import('../../src/modules/tasks/services/task-kanban.service.js'));
  ({ notificationService } =
    await import('../../src/modules/notifications/notification.service.js'));
  ({ createGithubEventNotificationService } =
    await import('../../src/modules/notifications/github-event-notification.service.js'));
  await cleanTestDatabase(prisma);
}, 60000);
afterEach(async () => cleanTestDatabase(prisma));
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function person(projectId) {
  sequence += 1;
  const user = await prisma.user.create({
    data: {
      name: `Pessoa do PR26 ${sequence}`,
      username: `pr26notif${sequence}`,
      email: `pr26-notif-${sequence}@example.invalid`
    }
  });
  await prisma.projectMembership.create({ data: { projectId, userId: user.id, role: 'MEMBER' } });
  return user;
}

const runDueJob = () =>
  notificationService.notifyOverdueTasks({ now: NOW, timeZone: TIME_ZONE, dryRun: false });

const overdueTo = (userId) =>
  prisma.notification.findMany({ where: { type: 'TASK_OVERDUE', recipientUserId: userId } });

async function linkedIssueEvent(occurredAt) {
  const project = await createProject(prisma);
  const responsible = await person(project.id);
  const task = await createTask(prisma, project.id, { responsibleUserId: responsible.id });
  const issue = await createIssue(prisma, project.id, {
    state: 'closed',
    closedAtGithub: occurredAt,
    number: 4000 + sequence
  });
  await prisma.taskIssue.create({ data: { taskId: task.id, issueId: issue.id } });
  await prisma.gitHubArtifactEvent.create({
    data: {
      projectId: project.id,
      type: 'ISSUE_CLOSED',
      issueId: issue.id,
      artifactNumber: issue.number,
      artifactTitle: issue.title,
      occurredAt,
      detectedAt: NOW,
      linkedTaskCount: 1,
      occurrenceKey: `ISSUE_CLOSED:${issue.id}:${occurredAt.toISOString()}`,
      nextAttemptAt: NOW,
      targets: { create: { taskId: task.id } }
    }
  });
  return { project, responsible, task };
}

describe('PR26 TF-REV-002: notificações literais (RF30, RF59, RF60, RF61)', () => {
  it('N-01 RF30 notifica o responsável que move a própria tarefa', async () => {
    const project = await createProject(prisma);
    const responsible = await person(project.id);
    const task = await createTask(prisma, project.id, { responsibleUserId: responsible.id });

    await kanban.moveTask(
      task.id,
      { toStatus: 'EM_ANDAMENTO' },
      { actor: { id: responsible.id, name: responsible.name } }
    );

    const rows = await prisma.notification.findMany({ where: { type: 'TASK_STATUS_CHANGED' } });
    expect(rows).toEqual([
      expect.objectContaining({
        recipientUserId: responsible.id,
        actorUserId: responsible.id,
        taskId: task.id,
        toStatus: 'EM_ANDAMENTO'
      })
    ]);
  });

  it('N-02 RF59 notifica tarefa vencida há 8 dias', async () => {
    const project = await createProject(prisma);
    const responsible = await person(project.id);
    await createTask(prisma, project.id, {
      responsibleUserId: responsible.id,
      deadline: new Date(NOW.getTime() - 9 * DAY)
    });

    const report = await runDueJob();

    expect(report).toMatchObject({ created: 1, failed: 0 });
    expect(report.excluded).not.toHaveProperty('OUTSIDE_WINDOW');
    expect(await overdueTo(responsible.id)).toHaveLength(1);
  });

  it('N-03 RF59 notifica tarefa vencida há 400 dias', async () => {
    const project = await createProject(prisma);
    const responsible = await person(project.id);
    await createTask(prisma, project.id, {
      responsibleUserId: responsible.id,
      deadline: new Date(NOW.getTime() - 400 * DAY)
    });

    await runDueJob();

    expect(await overdueTo(responsible.id)).toHaveLength(1);
  });

  it('N-04 RF60 notifica evento de issue vinculada ocorrido 30 dias antes da detecção', async () => {
    const { responsible, task } = await linkedIssueEvent(new Date(NOW.getTime() - 30 * DAY));

    const report = await createGithubEventNotificationService({ clock: () => NOW }).runJob({
      dryRun: false
    });

    expect(report).toMatchObject({ dispatched: 1, created: 1 });
    expect(report.excluded).not.toHaveProperty('OUTSIDE_WINDOW');
    expect(await prisma.notification.findMany({ where: { type: 'ISSUE_EVENT' } })).toEqual([
      expect.objectContaining({ recipientUserId: responsible.id, taskId: task.id })
    ]);
  });

  it('N-05 preferência desligada continua excluindo, sem janela', async () => {
    const project = await createProject(prisma);
    const responsible = await person(project.id);
    await prisma.notificationPreference.create({
      data: { userId: responsible.id, type: 'TASK_OVERDUE', enabled: false }
    });
    await createTask(prisma, project.id, {
      responsibleUserId: responsible.id,
      deadline: new Date(NOW.getTime() - 400 * DAY)
    });

    const report = await runDueJob();

    expect(report.excluded.PREFERENCE_OFF).toBe(1);
    expect(await overdueTo(responsible.id)).toEqual([]);
  });
});
