import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createIssue, createProject, createTask } from '../fixtures/factories.js';

let prisma;
let createJobRunner;
let JOB_NAMES;
let taskLinkRepository;
let runOverdueNotifications;
let sequence = 0;

const MINUTE_MS = 60_000;

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ createJobRunner } = await import('../../src/jobs/job-runner.js'));
  ({ JOB_NAMES } = await import('../../src/jobs/job-names.js'));
  ({ taskLinkRepository } =
    await import('../../src/modules/tasks/repositories/task-link.repository.js'));
  ({ runOverdueNotifications } = await import('../../src/jobs/cli/notify-overdue-tasks.js'));
  await cleanTestDatabase(prisma);
}, 60000);
afterEach(async () => cleanTestDatabase(prisma));
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

const silent = () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() });

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const runnerOf = (options = {}) =>
  createJobRunner({ enabled: true, log: silent(), firstRunDelayMs: 60 * MINUTE_MS, ...options });

async function member(projectId) {
  sequence += 1;
  const user = await prisma.user.create({
    data: {
      name: `Pessoa da agenda ${sequence}`,
      username: `r2agenda${sequence}`,
      email: `r2-agenda-${sequence}@example.invalid`
    }
  });
  await prisma.projectMembership.create({ data: { projectId, userId: user.id, role: 'MEMBER' } });
  return user;
}

const leaseOf = (name) => prisma.scheduledJobLease.findUnique({ where: { name } });

describe('TF-REV-006 — exclusão pela lease (ADR-024 D7)', () => {
  it('J-01 dois executores disputando o mesmo job: um roda, o outro pula', async () => {
    const gate = deferred();
    const runs = [];
    const job = (owner) => ({
      name: 'teste-exclusao',
      intervalMs: MINUTE_MS,
      run: async () => {
        runs.push(owner);
        await gate.promise;
        return { processed: 1 };
      }
    });
    const first = runnerOf({ jobs: [job('a')], ownerId: 'worker:a' });
    const second = runnerOf({ jobs: [job('b')], ownerId: 'worker:b' });

    const outcomes = Promise.all([first.runNow('teste-exclusao'), second.runNow('teste-exclusao')]);
    await vi.waitFor(() => expect(runs).toHaveLength(1));
    const holder = await leaseOf('teste-exclusao');
    expect(holder.leaseUntil.getTime()).toBeGreaterThan(Date.now());
    gate.resolve();
    const results = await outcomes;

    expect(results.filter((result) => result.acquired)).toHaveLength(1);
    expect(results.filter((result) => !result.acquired)).toEqual([{ acquired: false }]);
    expect(runs).toHaveLength(1);
    expect(holder.ownerId).toBe(`worker:${runs[0]}`);
    expect((await leaseOf('teste-exclusao')).leaseUntil.getTime()).toBeLessThanOrEqual(Date.now());
    await Promise.all([first.stop(), second.stop()]);
  });

  it('J-02 lease vencida é assumida; lease válida de outro dono bloqueia', async () => {
    const job = { name: 'teste-vencida', intervalMs: MINUTE_MS, run: vi.fn(async () => ({})) };
    await prisma.scheduledJobLease.create({
      data: {
        name: 'teste-vencida',
        ownerId: 'worker:caido',
        acquiredAt: new Date(Date.now() - 10 * MINUTE_MS),
        leaseUntil: new Date(Date.now() - 1000)
      }
    });
    const runner = runnerOf({ jobs: [job], ownerId: 'worker:novo' });

    expect(await runner.runNow('teste-vencida')).toMatchObject({ acquired: true });
    expect(job.run).toHaveBeenCalledOnce();

    await prisma.scheduledJobLease.update({
      where: { name: 'teste-vencida' },
      data: { ownerId: 'worker:vivo', leaseUntil: new Date(Date.now() + MINUTE_MS) }
    });
    expect(await runner.runNow('teste-vencida')).toEqual({ acquired: false });
    expect(job.run).toHaveBeenCalledOnce();
    await runner.stop();
  });

  it('J-08 o comando com --apply respeita a lease do worker e sai com 1 sem rodar', async () => {
    await prisma.scheduledJobLease.create({
      data: {
        name: JOB_NAMES.NOTIFICATIONS_DUE,
        ownerId: 'worker:ativo',
        acquiredAt: new Date(),
        leaseUntil: new Date(Date.now() + MINUTE_MS)
      }
    });
    const service = { notifyOverdueTasks: vi.fn() };
    const writeError = vi.fn();

    const code = await runOverdueNotifications({
      args: ['--apply'],
      service,
      databaseUrl: process.env.TEST_DATABASE_URL,
      write: vi.fn(),
      writeError
    });

    expect(code).toBe(1);
    expect(service.notifyOverdueTasks).not.toHaveBeenCalled();
    expect(writeError.mock.calls.join('')).toMatch(/Outra execução do job notifications-due/);
    expect((await leaseOf(JOB_NAMES.NOTIFICATIONS_DUE)).ownerId).toBe('worker:ativo');
  });
});

describe('TF-REV-006 — jobs agendados no worker (ADR-024 D7)', () => {
  it('J-06 o vencimento do RF59 roda no job e cria o aviso da tarefa vencida', async () => {
    const project = await createProject(prisma);
    const responsible = await member(project.id);
    const task = await createTask(prisma, project.id, {
      responsibleUserId: responsible.id,
      deadline: new Date('2026-10-01T00:00:00.000Z'),
      createdAt: new Date('2026-09-20T12:00:00.000Z')
    });
    const runner = runnerOf();

    const outcome = await runner.runNow(JOB_NAMES.NOTIFICATIONS_DUE);

    expect(outcome).toMatchObject({ acquired: true, result: { failed: 0, created: 1 } });
    expect(
      await prisma.notification.findMany({
        where: { recipientUserId: responsible.id, type: 'TASK_OVERDUE' },
        select: { taskId: true }
      })
    ).toEqual([{ taskId: task.id }]);
    await runner.stop();
  });

  it('J-07 o despacho pendente dos eventos do GitHub é retomado pelo job', async () => {
    const project = await createProject(prisma);
    const responsible = await member(project.id);
    const task = await createTask(prisma, project.id, { responsibleUserId: responsible.id });
    const issue = await createIssue(prisma, project.id, {
      state: 'open',
      createdAtGithub: new Date(Date.now() - 60 * MINUTE_MS)
    });
    await taskLinkRepository.createIssue(task.id, issue.id, null);
    const [pending] = await prisma.gitHubArtifactEvent.findMany({
      where: { projectId: project.id }
    });
    expect(pending.status).toBe('PENDING');
    const runner = runnerOf();

    expect(await runner.runNow(JOB_NAMES.GITHUB_EVENT_DISPATCH)).toMatchObject({ acquired: true });

    expect(
      (await prisma.gitHubArtifactEvent.findUnique({ where: { id: pending.id } })).status
    ).toBe('DISPATCHED');
    expect(
      await prisma.notification.findMany({
        where: { recipientUserId: responsible.id, type: 'ISSUE_EVENT' },
        select: { githubEvent: true, taskId: true }
      })
    ).toEqual([{ githubEvent: 'ISSUE_LINKED', taskId: task.id }]);
    await runner.stop();
  });

  it('J-07 os avisos de inconsistência pendentes são retomados pelo job', async () => {
    const project = await createProject(prisma);
    const person = await member(project.id);
    await prisma.traceabilityAlert.create({
      data: {
        projectId: project.id,
        type: 'ISSUE_CLOSED_WITHOUT_TASK',
        dedupeKey: `r2-agenda-${project.id}`,
        subjectCode: 'Issue #7',
        subjectTitle: 'Issue fechada sem tarefa',
        occurredAt: new Date(),
        noticeState: 'PENDING'
      }
    });
    const runner = runnerOf();

    expect(await runner.runNow(JOB_NAMES.TRACEABILITY_NOTICE_DISPATCH)).toMatchObject({
      acquired: true,
      result: { projects: 1, alerts: 1, failed: 0 }
    });

    expect(
      await prisma.traceabilityAlert.count({
        where: { projectId: project.id, noticeState: 'PENDING' }
      })
    ).toBe(0);
    expect(
      await prisma.notification.count({
        where: { recipientUserId: person.id, type: 'TRACEABILITY_INCONSISTENCY' }
      })
    ).toBe(1);
    await runner.stop();
  });

  it('J-07 a varredura reconcilia o projeto cuja última reconciliação falhou, com o gatilho SCHEDULED, e deixa o atualizado', async () => {
    const stale = await createProject(prisma);
    const healthy = await createProject(prisma);
    const failedAt = new Date(Date.now() - 30 * MINUTE_MS);
    const earlier = new Date(Date.now() - 60 * MINUTE_MS);
    await prisma.traceabilityAlertReconciliation.createMany({
      data: [
        {
          projectId: stale.id,
          lastTrigger: 'GITHUB_SYNC',
          lastAttemptAt: failedAt,
          lastSucceededAt: earlier,
          lastFailedAt: failedAt,
          lastErrorCode: 'P1001'
        },
        {
          projectId: healthy.id,
          lastTrigger: 'GITHUB_SYNC',
          lastAttemptAt: failedAt,
          lastSucceededAt: failedAt,
          lastFailedAt: earlier,
          lastErrorCode: 'P1001'
        }
      ]
    });
    const runner = runnerOf();

    expect(await runner.runNow(JOB_NAMES.TRACEABILITY_ALERTS)).toMatchObject({
      acquired: true,
      result: { projects: 1, reconciled: 1, failed: 0 }
    });

    const rows = await prisma.traceabilityAlertReconciliation.findMany({
      orderBy: { projectId: 'asc' },
      select: { projectId: true, lastTrigger: true, lastSucceededAt: true }
    });
    expect(rows.find((row) => row.projectId === stale.id)).toMatchObject({
      lastTrigger: 'SCHEDULED'
    });
    expect(
      rows.find((row) => row.projectId === stale.id).lastSucceededAt.getTime()
    ).toBeGreaterThan(failedAt.getTime());
    expect(rows.find((row) => row.projectId === healthy.id)).toMatchObject({
      lastTrigger: 'GITHUB_SYNC',
      lastSucceededAt: failedAt
    });
    await runner.stop();
  });
});
