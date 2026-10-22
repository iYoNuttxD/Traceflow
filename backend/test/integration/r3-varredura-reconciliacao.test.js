import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createProject } from '../fixtures/factories.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const silent = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() });

let prisma;
let alerts;
let createTraceabilityAlertService;
let traceabilityAlertService;
let createJobRunner;
let SCHEDULED_JOBS;
let JOB_NAMES;
let sequence = 0;

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ traceabilityAlertRepository: alerts } =
    await import('../../src/modules/traceability/traceability-alert.repository.js'));
  ({ createTraceabilityAlertService, traceabilityAlertService } =
    await import('../../src/modules/traceability/traceability-alert.service.js'));
  ({ createJobRunner } = await import('../../src/jobs/job-runner.js'));
  ({ SCHEDULED_JOBS } = await import('../../src/jobs/scheduled-jobs.js'));
  ({ JOB_NAMES } = await import('../../src/jobs/job-names.js'));
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

const ago = (now, offset) => new Date(now.getTime() - offset);

async function projectWith(reconciliation = null) {
  const project = await createProject(prisma);
  if (reconciliation)
    await prisma.traceabilityAlertReconciliation.create({
      data: { projectId: project.id, lastTrigger: 'GITHUB_SYNC', ...reconciliation }
    });
  return project;
}

async function member(projectId, role) {
  sequence += 1;
  const user = await prisma.user.create({
    data: {
      name: `Pessoa da varredura ${sequence}`,
      username: `r3varredura${sequence}`,
      email: `r3-varredura-${sequence}@example.invalid`
    }
  });
  await prisma.projectMembership.create({ data: { projectId, userId: user.id, role } });
  return user;
}

const serviceAt = (now) =>
  createTraceabilityAlertService(alerts, silent(), () => now, undefined, {
    dispatchSafely: vi.fn()
  });

async function stateOf(project, now) {
  const reader = await member(project.id, 'MEMBER');
  return (await serviceAt(now).summary(project.id, { actorUserId: reader.id })).reconciliation;
}

const recordOf = (projectId) =>
  prisma.traceabilityAlertReconciliation.findUnique({ where: { projectId } });

describe('UX-R3-03 — varredura das inconsistências sem depender do botão (ADR-015 D5)', () => {
  it('V-01 projeto ativo sem reconciliação é selecionado; projeto excluído não', async () => {
    const now = new Date();
    const fresh = await projectWith();
    await prisma.project.update({
      where: { id: (await projectWith()).id },
      data: { deletedAt: now }
    });

    expect(await alerts.findProjectsToReconcile(now)).toEqual([fresh.id]);
  });

  it('V-02 tentativa sem resultado entra depois de 15 minutos; antes, ela pode estar em andamento', async () => {
    const now = new Date();
    const succeeded = ago(now, 2 * HOUR);
    const stuck = await projectWith({
      lastSucceededAt: succeeded,
      lastAttemptAt: ago(now, 16 * MINUTE)
    });
    await projectWith({ lastSucceededAt: succeeded, lastAttemptAt: ago(now, 14 * MINUTE) });

    expect(await alerts.findProjectsToReconcile(now)).toEqual([stuck.id]);
  });

  it('V-03 sucesso com mais de 24 h é selecionado', async () => {
    const now = new Date();
    const old = ago(now, 24 * HOUR + MINUTE);
    const project = await projectWith({ lastSucceededAt: old, lastAttemptAt: old });

    expect(await alerts.findProjectsToReconcile(now)).toEqual([project.id]);
  });

  it('V-04 sucesso recente, e falha antiga já superada, não são selecionados', async () => {
    const now = new Date();
    const recent = ago(now, HOUR);
    await projectWith({ lastSucceededAt: recent, lastAttemptAt: recent });
    await projectWith({
      lastSucceededAt: recent,
      lastAttemptAt: recent,
      lastFailedAt: ago(now, 3 * HOUR),
      lastErrorCode: 'P1001'
    });

    expect(await alerts.findProjectsToReconcile(now)).toEqual([]);
  });

  it('V-05 a ordem é falha, tentativa sem resultado, sem reconciliação e sucesso antigo; em cada grupo, o mais antigo primeiro', async () => {
    const now = new Date();
    const success = ago(now, 3 * HOUR);
    const old = await projectWith({
      lastSucceededAt: ago(now, 30 * HOUR),
      lastAttemptAt: ago(now, 30 * HOUR)
    });
    const never = await projectWith();
    const recentFailure = await projectWith({
      lastSucceededAt: success,
      lastAttemptAt: ago(now, 20 * MINUTE),
      lastFailedAt: ago(now, 20 * MINUTE),
      lastErrorCode: 'P1001'
    });
    const stuck = await projectWith({ lastSucceededAt: success, lastAttemptAt: ago(now, HOUR) });
    const older = await projectWith({
      lastSucceededAt: ago(now, 40 * HOUR),
      lastAttemptAt: ago(now, 40 * HOUR)
    });
    const oldFailure = await projectWith({
      lastSucceededAt: success,
      lastAttemptAt: ago(now, 2 * HOUR),
      lastFailedAt: ago(now, 2 * HOUR),
      lastErrorCode: 'P1001'
    });
    const failedOnly = await projectWith({
      lastAttemptAt: ago(now, HOUR),
      lastFailedAt: ago(now, HOUR),
      lastErrorCode: 'P2034'
    });

    expect(await alerts.findProjectsToReconcile(now)).toEqual([
      oldFailure.id,
      failedOnly.id,
      recentFailure.id,
      stuck.id,
      never.id,
      older.id,
      old.id
    ]);
  });

  it('V-06 a varredura tem limite de 10 minutos e para no sinal, com o que ficou para trás', async () => {
    const job = SCHEDULED_JOBS.find((entry) => entry.name === JOB_NAMES.TRACEABILITY_ALERTS);
    const projects = [await projectWith(), await projectWith(), await projectWith()];
    const controller = new AbortController();
    const reconcile = alerts.reconcileProject.bind(alerts);
    vi.spyOn(alerts, 'reconcileProject').mockImplementation(async (...args) => {
      const result = await reconcile(...args);
      controller.abort();
      return result;
    });

    const report = await traceabilityAlertService.reconcileScheduledProjects({
      signal: controller.signal
    });

    expect(job).toMatchObject({ intervalMs: 60 * MINUTE, maxRunMs: 10 * MINUTE });
    expect(report).toEqual({
      projects: 3,
      reconciled: 1,
      failed: 0,
      interrupted: true,
      pendingProjects: 2
    });
    expect(await recordOf(projects[0].id)).toMatchObject({ lastTrigger: 'SCHEDULED' });
    expect(await recordOf(projects[1].id)).toBeNull();
    expect(await recordOf(projects[2].id)).toBeNull();
  });

  it('V-07 a varredura grava SCHEDULED, e a tentativa fica gravada antes, mesmo quando o resultado se perde', async () => {
    const project = await projectWith();
    const runner = createJobRunner({ enabled: true, log: silent(), firstRunDelayMs: 60 * MINUTE });

    expect(await runner.runNow(JOB_NAMES.TRACEABILITY_ALERTS)).toMatchObject({
      acquired: true,
      result: { projects: 1, reconciled: 1, failed: 0 }
    });
    await runner.stop();
    const first = await recordOf(project.id);
    expect(first).toMatchObject({ lastTrigger: 'SCHEDULED', lastFailedAt: null });
    expect(first.lastAttemptAt.getTime()).toBeLessThanOrEqual(first.lastSucceededAt.getTime());

    const attemptAt = new Date(first.lastSucceededAt.getTime() + MINUTE);
    const seenAtStart = [];
    vi.spyOn(alerts, 'reconcileProject').mockImplementation(async (projectId) => {
      seenAtStart.push(await recordOf(projectId));
      throw Object.assign(new Error('falha injetada'), { code: 'P1001' });
    });
    vi.spyOn(alerts, 'recordReconciliation').mockRejectedValue(
      Object.assign(new Error('registro perdido'), { code: 'P1001' })
    );

    await expect(serviceAt(attemptAt).reconcileAfterSync(project.id)).resolves.toBeNull();

    expect(seenAtStart).toEqual([
      expect.objectContaining({ lastTrigger: 'GITHUB_SYNC', lastAttemptAt: attemptAt })
    ]);
    expect(await recordOf(project.id)).toMatchObject({
      lastAttemptAt: attemptAt,
      lastSucceededAt: first.lastSucceededAt,
      lastFailedAt: null
    });
    const later = new Date(attemptAt.getTime() + 16 * MINUTE);
    expect(await alerts.findProjectsToReconcile(later)).toEqual([project.id]);
    expect((await stateOf(project, later)).state).toBe('STALE');
  });

  it('V-08 o reprocessamento manual continua, só para MANAGER+, auditado e com o gatilho MANUAL', async () => {
    const project = await projectWith();
    const manager = await member(project.id, 'MANAGER');
    const reader = await member(project.id, 'MEMBER');

    await expect(
      traceabilityAlertService.reconcileManually(project.id, { actorUserId: reader.id })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(await recordOf(project.id)).toBeNull();

    const done = await traceabilityAlertService.reconcileManually(project.id, {
      actorUserId: manager.id,
      requestId: 'r3-v08'
    });

    expect(done).toMatchObject({ projectId: project.id, result: { created: 0 } });
    expect(await recordOf(project.id)).toMatchObject({ lastTrigger: 'MANUAL' });
    expect(
      await prisma.auditEvent.count({
        where: { action: 'TRACEABILITY_ALERTS_RECONCILED', projectId: project.id }
      })
    ).toBe(1);
  });

  it('V-09 o resumo diz PENDING_FIRST, STALE ou CURRENT, sempre com o objeto da reconciliação', async () => {
    const now = new Date();
    const recent = ago(now, HOUR);
    const cases = [
      [null, 'PENDING_FIRST'],
      [{ lastAttemptAt: recent, lastFailedAt: recent, lastErrorCode: 'P1001' }, 'PENDING_FIRST'],
      [{ lastAttemptAt: recent, lastSucceededAt: recent }, 'CURRENT'],
      [
        {
          lastAttemptAt: ago(now, 10 * MINUTE),
          lastSucceededAt: recent,
          lastFailedAt: ago(now, 10 * MINUTE),
          lastErrorCode: 'P1001'
        },
        'STALE'
      ],
      [{ lastAttemptAt: ago(now, 16 * MINUTE), lastSucceededAt: recent }, 'STALE'],
      [{ lastAttemptAt: ago(now, 14 * MINUTE), lastSucceededAt: recent }, 'CURRENT'],
      [
        {
          lastAttemptAt: ago(now, 25 * HOUR + MINUTE),
          lastSucceededAt: ago(now, 25 * HOUR + MINUTE)
        },
        'STALE'
      ],
      [
        {
          lastAttemptAt: ago(now, 24 * HOUR + 30 * MINUTE),
          lastSucceededAt: ago(now, 24 * HOUR + 30 * MINUTE)
        },
        'CURRENT'
      ]
    ];

    for (const [reconciliation, state] of cases) {
      const project = await projectWith(reconciliation);
      expect(await stateOf(project, now), JSON.stringify(reconciliation)).toEqual({
        state,
        lastAttemptAt: reconciliation?.lastAttemptAt ?? null,
        lastSucceededAt: reconciliation?.lastSucceededAt ?? null,
        lastFailedAt: reconciliation?.lastFailedAt ?? null,
        lastTrigger: reconciliation ? 'GITHUB_SYNC' : null
      });
    }
  });
});
