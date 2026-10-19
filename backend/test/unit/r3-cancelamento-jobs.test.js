import { describe, expect, it } from 'vitest';
import { createGithubEventNotificationService } from '../../src/modules/notifications/github-event-notification.service.js';
import { createNotificationService } from '../../src/modules/notifications/notification.service.js';
import { createTraceabilityNoticeService } from '../../src/modules/notifications/traceability-notice.service.js';

const silent = { debug() {}, info() {}, warn() {}, error() {} };

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function overdueTasks(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    title: `Tarefa ${index + 1}`,
    deadline: new Date('2026-10-01T00:00:00.000Z'),
    responsibleUserId: 7,
    status: 'A_FAZER',
    createdAt: new Date('2026-09-01T00:00:00.000Z')
  }));
}

function overdueService({ projects = [1], tasks = 5001, persist }) {
  const repository = {
    listActiveProjectIds: async () => projects,
    findOverdueCandidates: async () => overdueTasks(tasks),
    activeAccountIds: async () => new Set([7]),
    activeMemberIds: async () => new Set([7]),
    overduePreferences: async () => new Map(),
    existingOverdueKeys: async () => new Set(),
    currentOverdueDecisions: async () => new Map(),
    persistOverdueUnit: persist
  };
  return createNotificationService({
    repository,
    log: silent,
    clock: () => new Date('2026-10-18T12:00:00.000Z'),
    configuration: { appTimeZone: 'America/Sao_Paulo' }
  });
}

describe('TF-REV-015 — nenhuma unidade nova depois do cancelamento', () => {
  it('K-01 RF59: a unidade que aborta é a última; o relatório é parcial (A4)', async () => {
    const controller = new AbortController();
    const calls = [];
    const service = overdueService({
      persist: async (_projectId, unit) => {
        calls.push({ afterAbort: controller.signal.aborted });
        if (calls.length === 1) controller.abort();
        return unit.rows.length;
      }
    });

    const report = await service.notifyOverdueTasks({ dryRun: false, signal: controller.signal });

    expect(calls).toEqual([{ afterAbort: false }]);
    expect(report).toMatchObject({
      interrupted: true,
      pendingProjects: 1,
      created: 1000,
      alreadyNotified: 0,
      failed: 0
    });
  });

  it('K-02 despacho do GitHub: nenhuma reivindicação depois do cancelamento (A4b)', async () => {
    const controller = new AbortController();
    let claims = 0;
    let afterAbort = 0;
    let served = false;
    const repository = {
      failInterrupted: async () => 0,
      findDueEventIds: async () => {
        if (served) return [];
        served = true;
        return Array.from({ length: 100 }, (_, index) => ({ id: index + 1, projectId: 1 }));
      },
      claim: async () => {
        if (controller.signal.aborted) afterAbort += 1;
        claims += 1;
        if (claims === 1) controller.abort();
        return false;
      },
      countFailed: async () => 0,
      queueSummary: async () => ({ pending: 99, due: 99, oldestDueAt: null })
    };
    const service = createGithubEventNotificationService({ repository, log: silent });

    const report = await service.runJob({ dryRun: false, signal: controller.signal });

    expect({ claims, afterAbort }).toEqual({ claims: 1, afterAbort: 0 });
    expect(report).toMatchObject({ interrupted: true, pendingEvents: 99, scanned: 1, busy: 1 });
  });

  it('K-03 avisos de inconsistência: nenhum lote novo depois do cancelamento (A4c)', async () => {
    const controller = new AbortController();
    let marked = 0;
    let afterAbort = 0;
    const alerts = [1, 2, 3].map((id) => ({
      id,
      type: 'ISSUE_CLOSED_WITHOUT_TASK',
      subjectCode: `Issue #${id}`,
      detectedAt: new Date(`2026-10-1${id}T12:00:00.000Z`)
    }));
    const repository = {
      projectsWithPendingNotices: async () => [1, 2],
      pendingAlerts: async () => alerts,
      activeRecipients: async () => [],
      insertNotices: async () => 0,
      markDispatched: async () => {
        if (controller.signal.aborted) afterAbort += 1;
        marked += 1;
        if (marked === 1) controller.abort();
      }
    };
    const service = createTraceabilityNoticeService({ repository, log: silent });

    const report = await service.dispatchAll({ signal: controller.signal });

    expect({ marked, afterAbort }).toEqual({ marked: 1, afterAbort: 0 });
    expect(report).toMatchObject({
      interrupted: true,
      pendingBatches: 2,
      pendingProjects: 2,
      alerts: 1,
      failed: 0
    });
  });

  it('K-04 RF59: as unidades já iniciadas terminam e contam; nenhuma outra começa', async () => {
    const controller = new AbortController();
    const gates = [];
    let started = 0;
    const service = overdueService({
      persist: (_projectId, unit) => {
        started += 1;
        const gate = deferred();
        gates.push(gate);
        return gate.promise.then(() => unit.rows.length);
      }
    });

    const running = service.notifyOverdueTasks({ dryRun: false, signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(started).toBe(4);
    controller.abort();
    for (const gate of gates) gate.resolve();
    const report = await running;

    expect(started).toBe(4);
    expect(report).toMatchObject({ interrupted: true, created: 4000, pendingProjects: 1 });
  });

  it('K-05 RF59: pendingProjects conta o projeto interrompido no meio e os que nem começaram', async () => {
    const controller = new AbortController();
    let calls = 0;
    const service = overdueService({
      projects: [1, 2, 3],
      tasks: 2500,
      persist: async (_projectId, unit) => {
        calls += 1;
        if (calls === 1) controller.abort();
        return unit.rows.length;
      }
    });

    const report = await service.notifyOverdueTasks({ dryRun: false, signal: controller.signal });

    expect(calls).toBe(1);
    expect(report).toMatchObject({ projects: 3, interrupted: true, pendingProjects: 3 });
  });

  it('K-06 sem cancelamento, os três jobs fazem tudo e não falam em interrupção', async () => {
    let units = 0;
    const overdue = await overdueService({
      persist: async (_projectId, unit) => {
        units += 1;
        return unit.rows.length;
      }
    }).notifyOverdueTasks({ dryRun: false, signal: new AbortController().signal });
    expect(units).toBe(6);
    expect(overdue).toMatchObject({ created: 5001, failed: 0 });
    expect(overdue).not.toHaveProperty('interrupted');

    let claims = 0;
    let served = false;
    const github = await createGithubEventNotificationService({
      repository: {
        failInterrupted: async () => 0,
        findDueEventIds: async () => {
          if (served) return [];
          served = true;
          return Array.from({ length: 5 }, (_, index) => ({ id: index + 1, projectId: 1 }));
        },
        claim: async () => {
          claims += 1;
          return false;
        },
        countFailed: async () => 0,
        queueSummary: async () => ({ pending: 0, due: 0, oldestDueAt: null })
      },
      log: silent
    }).runJob({ dryRun: false, signal: new AbortController().signal });
    expect(claims).toBe(5);
    expect(github).not.toHaveProperty('interrupted');

    let marked = 0;
    const notices = await createTraceabilityNoticeService({
      repository: {
        projectsWithPendingNotices: async () => [1],
        pendingAlerts: async () =>
          [1, 2].map((id) => ({
            id,
            type: 'ISSUE_CLOSED_WITHOUT_TASK',
            subjectCode: `Issue #${id}`,
            detectedAt: new Date(`2026-10-1${id}T12:00:00.000Z`)
          })),
        activeRecipients: async () => [],
        insertNotices: async () => 0,
        markDispatched: async () => {
          marked += 1;
        }
      },
      log: silent
    }).dispatchAll({ signal: new AbortController().signal });
    expect(marked).toBe(2);
    expect(notices).not.toHaveProperty('interrupted');
  });
});
