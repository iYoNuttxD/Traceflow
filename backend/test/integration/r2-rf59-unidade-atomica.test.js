import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createProject, createTask } from '../fixtures/factories.js';

let prisma;
let notificationService;
let createNotificationMetricsService;
let notificationMetricsRepository;
let sequence = 0;

const NOW = new Date('2026-10-20T12:00:00.000Z');
const TIME_ZONE = 'America/Sao_Paulo';
const DUE_DATE = '2026-10-10';
const REGISTRY_START = new Date('2026-08-01T00:00:00.000Z');

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ notificationService } =
    await import('../../src/modules/notifications/notification.service.js'));
  ({ createNotificationMetricsService } =
    await import('../../src/modules/notifications/notification-metrics.service.js'));
  ({ notificationMetricsRepository } =
    await import('../../src/modules/notifications/notification-metrics.repository.js'));
  await cleanTestDatabase(prisma);
}, 60000);
afterEach(async () => cleanTestDatabase(prisma));
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function overdueScenario() {
  sequence += 1;
  const project = await createProject(prisma);
  const responsible = await prisma.user.create({
    data: {
      name: `Responsável R2 ${sequence}`,
      username: `r2rf59${sequence}`,
      email: `r2-rf59-${sequence}@example.invalid`
    }
  });
  await prisma.projectMembership.create({
    data: { projectId: project.id, userId: responsible.id, role: 'MEMBER' }
  });
  const task = await createTask(prisma, project.id, {
    responsibleUserId: responsible.id,
    deadline: new Date(`${DUE_DATE}T00:00:00.000Z`),
    createdAt: new Date('2026-10-05T12:00:00.000Z')
  });
  return { project, responsible, task };
}

const runDueJob = (projectId) =>
  notificationService.notifyOverdueTasks({
    projectId,
    now: NOW,
    timeZone: TIME_ZONE,
    dryRun: false
  });

async function committed(task) {
  return {
    sent: await prisma.notificationDecision.count({
      where: { type: 'TASK_OVERDUE', eventKey: `${task.id}:${DUE_DATE}`, outcome: 'SENT' }
    }),
    notifications: await prisma.notification.count({
      where: { type: 'TASK_OVERDUE', taskId: task.id }
    })
  };
}

function holdNotificationKey({ project, responsible, task }) {
  let release;
  let ready;
  const released = new Promise((resolve) => {
    release = resolve;
  });
  const holding = new Promise((resolve) => {
    ready = resolve;
  });
  const done = prisma
    .$transaction(
      async (tx) => {
        await tx.notification.create({
          data: {
            recipientUserId: responsible.id,
            projectId: project.id,
            taskId: task.id,
            type: 'TASK_OVERDUE',
            dedupeKey: `TASK_OVERDUE:${task.id}:${DUE_DATE}`,
            taskTitle: task.title,
            dueDate: new Date(`${DUE_DATE}T00:00:00.000Z`)
          }
        });
        ready();
        await released;
        throw new Error('desfaz a trava');
      },
      { timeout: 20000 }
    )
    .catch((error) => {
      if (error.message !== 'desfaz a trava') throw error;
    });
  return { holding, release: () => release(), done };
}

async function blockedNotificationInsert() {
  for (let round = 0; round < 100; round += 1) {
    const rows = await prisma.$queryRawUnsafe(
      "SELECT ID AS id FROM information_schema.PROCESSLIST WHERE INFO LIKE 'INSERT IGNORE INTO %.`Notification` (%'"
    );
    if (rows.length) return Number(rows[0].id);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('A gravação da notificação não ficou presa na trava.');
}

describe('TF-REV-009 — notificação e decisão do RF59 na mesma transação', () => {
  it('U-01 a varredura grava a notificação e a decisão SENT, e a segunda não repete', async () => {
    const scenario = await overdueScenario();

    const first = await runDueJob(scenario.project.id);
    const second = await runDueJob(scenario.project.id);

    expect(first.created).toBe(1);
    expect(second.created).toBe(0);
    expect(second.alreadyNotified).toBe(1);
    expect(await committed(scenario.task)).toEqual({ sent: 1, notifications: 1 });
  });

  it('U-02 a falha dentro do lote não deixa nenhuma das duas, e a retomada cria uma vez', async () => {
    const scenario = await overdueScenario();
    const blocker = holdNotificationKey(scenario);
    await blocker.holding;

    const job = runDueJob(scenario.project.id);
    const connection = await blockedNotificationInsert();
    await prisma.$executeRawUnsafe(`KILL QUERY ${connection}`);
    const failed = await job;
    blocker.release();
    await blocker.done;

    expect(failed.failed).toBe(1);
    expect(await committed(scenario.task)).toEqual({ sent: 0, notifications: 0 });

    const resumed = await runDueJob(scenario.project.id);

    expect(resumed.created).toBe(1);
    expect(await committed(scenario.task)).toEqual({ sent: 1, notifications: 1 });
  }, 30000);

  it('U-03 enquanto a notificação espera, nenhuma decisão SENT fica confirmada sem ela', async () => {
    const scenario = await overdueScenario();
    const blocker = holdNotificationKey(scenario);
    await blocker.holding;

    let finished = false;
    const job = runDueJob(scenario.project.id).finally(() => {
      finished = true;
    });
    const samples = [];
    for (let round = 0; round < 12; round += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      samples.push(await committed(scenario.task));
    }
    const blockedUntilRelease = !finished;
    blocker.release();
    await blocker.done;
    const report = await job;

    expect(blockedUntilRelease).toBe(true);
    expect(samples.every((sample) => sample.notifications === 0)).toBe(true);
    expect(samples.filter((sample) => sample.sent > 0)).toEqual([]);
    expect(report.created).toBe(1);
    expect(await committed(scenario.task)).toEqual({ sent: 1, notifications: 1 });
  }, 30000);

  it('U-03 a métrica do período não conta envio que a notificação não confirmou', async () => {
    const scenario = await overdueScenario();
    const blocker = holdNotificationKey(scenario);
    await blocker.holding;
    const job = runDueJob(scenario.project.id);
    await new Promise((resolve) => setTimeout(resolve, 600));

    const metrics = createNotificationMetricsService({
      repository: {
        ...notificationMetricsRepository,
        registryStarts: async () => ({ decisions: REGISTRY_START, githubEvents: REGISTRY_START })
      },
      clock: () => NOW
    });
    const report = await metrics.compute({
      from: '2026-10-01',
      to: '2026-10-15',
      timeZone: TIME_ZONE,
      projectId: scenario.project.id
    });
    blocker.release();
    await blocker.done;
    await job;

    expect(report.requisitos.RF59.ocorridos).toBe(1);
    expect(report.requisitos.RF59.enviadasCorretamente).toBe(0);
    expect(report.requisitos.RF59.coberturaTotal.valor).toBeNull();
  }, 30000);
});
