import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractImportSpecifiers } from '../../scripts/check-architecture.js';
import { createEnvironment } from '../../src/config/env.js';
import { createJobLease } from '../../src/jobs/job-lease.js';
import { createJobRunner } from '../../src/jobs/job-runner.js';
import { runOverdueNotifications } from '../../src/jobs/cli/notify-overdue-tasks.js';
import { runGithubEventNotifications } from '../../src/jobs/cli/dispatch-github-event-notifications.js';
import { runAlertReconciliation } from '../../src/jobs/cli/reconcile-traceability-alerts.js';
import { createGithubSyncScheduler } from '../../src/modules/github/services/github-sync-scheduler.service.js';
import { createWorkerRuntime } from '../../src/shared/runtime/worker-runtime.js';

const backend = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PRODUCTION = 'mysql://user:password@db.traceflow.example:3306/traceflow_prod';
const LOCAL = 'mysql://user:password@localhost:3306/traceflow';
const ARTIFACT_PREFIXES = ['src/', 'prisma/'];
const COMMAND_SCRIPTS = {
  'notifications:due:dry-run': 'node src/jobs/cli/notify-overdue-tasks.js',
  'notifications:due': 'node src/jobs/cli/notify-overdue-tasks.js --apply',
  'notifications:github-events:dry-run': 'node src/jobs/cli/dispatch-github-event-notifications.js',
  'notifications:github-events': 'node src/jobs/cli/dispatch-github-event-notifications.js --apply',
  'traceability:alerts:dry-run': 'node src/jobs/cli/reconcile-traceability-alerts.js',
  'traceability:alerts': 'node src/jobs/cli/reconcile-traceability-alerts.js --apply',
  'notifications:metrics': 'node src/jobs/cli/notification-metrics.js'
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const silent = () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() });

function memoryLeases() {
  const rows = new Map();
  const released = [];
  return {
    released,
    async acquire({ name, ownerId, now, leaseUntil }) {
      const row = rows.get(name);
      if (row && row.leaseUntil > now && row.ownerId !== ownerId) return false;
      rows.set(name, { ownerId, leaseUntil });
      return true;
    },
    async renew({ name, ownerId, leaseUntil }) {
      const row = rows.get(name);
      if (row?.ownerId !== ownerId) return false;
      row.leaseUntil = leaseUntil;
      return true;
    },
    async release({ name, ownerId, now }) {
      const row = rows.get(name);
      if (row?.ownerId === ownerId) row.leaseUntil = now;
      released.push(name);
    }
  };
}

function runnerWith(jobs, overrides = {}) {
  const log = silent();
  const leases = memoryLeases();
  const runner = createJobRunner({
    jobs,
    enabled: true,
    lease: createJobLease({ leases, log }),
    log,
    firstRunDelayMs: 0,
    ...overrides
  });
  return { runner, log, leases };
}

function closureOf(entries) {
  const files = new Set();
  const pending = [...entries];
  while (pending.length) {
    const file = pending.pop();
    if (files.has(file)) continue;
    files.add(file);
    for (const specifier of extractImportSpecifiers(readFileSync(join(backend, file), 'utf8')))
      if (specifier.startsWith('.'))
        pending.push(posix.normalize(posix.join(posix.dirname(file), specifier)));
  }
  return [...files].sort();
}

describe('TF-REV-006 — executor dos jobs (ADR-024 D7)', () => {
  it('J-03 o stop() aborta a execução em curso, espera ela parar entre lotes e libera a lease', async () => {
    const batches = [];
    let finished = false;
    const job = {
      name: 'lotes',
      intervalMs: 1000,
      run: async ({ signal }) => {
        for (let batch = 0; batch < 200; batch += 1) {
          if (signal.aborted) break;
          batches.push(batch);
          await new Promise((done) => setTimeout(done, 20));
        }
        finished = true;
        return { batches: batches.length };
      }
    };
    const { runner, log, leases } = runnerWith([job]);

    expect(runner.start()).toBe(true);
    await vi.waitFor(() => expect(batches.length).toBeGreaterThan(2));
    await runner.stop();

    expect(finished).toBe(true);
    expect(leases.released).toEqual(['lotes']);
    const stoppedAt = batches.length;
    await new Promise((done) => setTimeout(done, 50));
    expect(stoppedAt).toBeLessThan(200);
    expect(batches).toHaveLength(stoppedAt);
    expect(log.info).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ event: 'scheduled_job_completed', job: 'lotes', interrupted: true })
    );
  });

  it('J-03 o limite por execução aborta o job no prazo', async () => {
    vi.useFakeTimers();
    let observed = null;
    const job = {
      name: 'limitado',
      intervalMs: 60_000,
      maxRunMs: 300_000,
      run: ({ signal }) =>
        new Promise((done) => {
          signal.addEventListener('abort', () => {
            observed = Date.now();
            done({ processed: 1 });
          });
        })
    };
    const { runner } = runnerWith([job], { firstRunDelayMs: 60_000 });
    const startedAt = Date.now();

    const outcome = runner.runNow('limitado');
    await vi.advanceTimersByTimeAsync(299_999);
    expect(observed).toBeNull();
    await vi.advanceTimersByTimeAsync(1);

    expect(await outcome).toMatchObject({ acquired: true, result: { processed: 1 } });
    expect(observed - startedAt).toBe(300_000);
    await runner.stop();
  });

  it('J-03 a lease perdida durante a execução aborta o job', async () => {
    vi.useFakeTimers();
    const log = silent();
    const leases = memoryLeases();
    leases.renew = async () => false;
    const job = {
      name: 'renovada',
      intervalMs: 60_000,
      run: ({ signal }) =>
        new Promise((done) => signal.addEventListener('abort', () => done({ processed: 0 })))
    };
    const runner = createJobRunner({
      jobs: [job],
      enabled: true,
      lease: createJobLease({ leases, log }),
      log,
      firstRunDelayMs: 60_000
    });

    const outcome = runner.runNow('renovada');
    await vi.advanceTimersByTimeAsync(30_000);

    expect(await outcome).toMatchObject({ acquired: true });
    expect(log.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ event: 'scheduled_job_lease_lost', job: 'renovada' })
    );
    await runner.stop();
  });

  it('J-04 a falha de um job é registrada, não para os outros e a próxima execução retoma', async () => {
    vi.useFakeTimers();
    const failing = {
      name: 'falha',
      intervalMs: 60_000,
      run: vi.fn(async () => {
        throw Object.assign(new Error('sem banco'), { code: 'P1001' });
      })
    };
    const healthy = {
      name: 'saudavel',
      intervalMs: 60_000,
      run: vi.fn(async () => ({ created: 1 }))
    };
    const { runner, log } = runnerWith([failing, healthy]);

    runner.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(failing.run).toHaveBeenCalledOnce();
    expect(healthy.run).toHaveBeenCalledOnce();
    expect(log.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ event: 'scheduled_job_failed', job: 'falha', errorCode: 'P1001' })
    );

    await vi.advanceTimersByTimeAsync(60_000);
    expect(failing.run).toHaveBeenCalledTimes(2);
    expect(healthy.run).toHaveBeenCalledTimes(2);
    await runner.stop();
  });

  it('J-05 o worker sem o agendador do GitHub continua com os jobs; JOBS_ENABLED=false desliga', async () => {
    const job = { name: 'so-jobs', intervalMs: 60_000, run: vi.fn(async () => ({ created: 0 })) };
    const exit = vi.fn();
    const { runner } = runnerWith([job]);
    const runtime = createWorkerRuntime({
      services: [createGithubSyncScheduler({ enabled: false, log: silent() }), runner],
      disconnect: async () => undefined,
      logger: silent(),
      exit
    });

    expect(runtime.start()).toBe(true);
    await vi.waitFor(() => expect(job.run).toHaveBeenCalledOnce());
    await runtime.stop('SIGTERM');
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);

    const disabled = createJobRunner({ jobs: [job], enabled: false, log: silent() });
    expect(disabled.start()).toBe(false);
    const base = {
      NODE_ENV: 'development',
      PORT: '3001',
      DATABASE_URL: LOCAL,
      FRONTEND_URL: 'http://localhost:5173'
    };
    expect(createEnvironment(base).jobsEnabled).toBe(true);
    expect(createEnvironment({ ...base, JOBS_ENABLED: 'false' }).jobsEnabled).toBe(false);
    expect(() => createEnvironment({ ...base, JOBS_ENABLED: 'sim' })).toThrow(/JOBS_ENABLED/);
  });
});

describe('TF-REV-006 — comandos manuais no artefato (ADR-024 D8)', () => {
  let lease;
  let busy;

  beforeEach(() => {
    lease = vi.fn(async (_name, work) => ({
      acquired: true,
      result: await work(new AbortController().signal)
    }));
    busy = vi.fn(async () => ({ acquired: false }));
  });

  it('J-08 os nomes do package.json apontam para src/jobs/cli, sem mudar as opções', () => {
    const { scripts } = JSON.parse(readFileSync(join(backend, 'package.json'), 'utf8'));

    for (const [name, command] of Object.entries(COMMAND_SCRIPTS)) {
      expect(scripts[name]).toBe(command);
      expect(existsSync(join(backend, command.split(' ')[1]))).toBe(true);
    }
    for (const file of [
      'notify-overdue-tasks',
      'dispatch-github-event-notifications',
      'reconcile-traceability-alerts',
      'notification-metrics'
    ])
      expect(existsSync(join(backend, 'scripts', `${file}.js`))).toBe(false);
  });

  it('J-08 a proteção de banco vem antes da lease e do serviço', async () => {
    const overdue = { notifyOverdueTasks: vi.fn() };
    const github = { isActiveProject: vi.fn(async () => true), runJob: vi.fn() };
    const alerts = { reconcileAllProjects: vi.fn(), reconcileProject: vi.fn() };
    const writeError = vi.fn();
    const common = { databaseUrl: PRODUCTION, write: vi.fn(), writeError, lease };

    expect(await runOverdueNotifications({ args: ['--apply'], service: overdue, ...common })).toBe(
      1
    );
    expect(
      await runGithubEventNotifications({ args: ['--apply'], service: github, ...common })
    ).toBe(1);
    expect(await runAlertReconciliation({ args: ['--apply'], service: alerts, ...common })).toBe(1);

    expect(lease).not.toHaveBeenCalled();
    expect(overdue.notifyOverdueTasks).not.toHaveBeenCalled();
    expect(github.runJob).not.toHaveBeenCalled();
    expect(alerts.reconcileAllProjects).not.toHaveBeenCalled();
    expect(writeError.mock.calls.join('')).toMatch(/--confirm-production/);
  });

  it('J-08 com --apply, cada comando toma a lease do job; ocupada, sai com 1 sem rodar', async () => {
    const overdue = { notifyOverdueTasks: vi.fn(async () => ({ failed: 0 })) };
    const github = {
      isActiveProject: vi.fn(async () => true),
      runJob: vi.fn(async () => ({ failed: 0, retryScheduled: 0 }))
    };
    const alerts = { reconcileAllProjects: vi.fn(async () => []), reconcileProject: vi.fn() };
    const common = { databaseUrl: LOCAL, write: vi.fn(), writeError: vi.fn() };

    expect(
      await runOverdueNotifications({ args: ['--apply'], service: overdue, ...common, lease })
    ).toBe(0);
    expect(
      await runGithubEventNotifications({ args: ['--apply'], service: github, ...common, lease })
    ).toBe(0);
    expect(
      await runAlertReconciliation({ args: ['--apply'], service: alerts, ...common, lease })
    ).toBe(0);
    expect(lease.mock.calls.map(([name]) => name)).toEqual([
      'notifications-due',
      'github-event-dispatch',
      'traceability-alerts'
    ]);

    const writeError = vi.fn();
    const blocked = { notifyOverdueTasks: vi.fn() };
    expect(
      await runOverdueNotifications({
        args: ['--apply'],
        service: blocked,
        ...common,
        writeError,
        lease: busy
      })
    ).toBe(1);
    expect(blocked.notifyOverdueTasks).not.toHaveBeenCalled();
    expect(writeError.mock.calls.join('')).toMatch(/Outra execução do job notifications-due/);

    const dryRun = { notifyOverdueTasks: vi.fn(async () => ({ failed: 0 })) };
    expect(
      await runOverdueNotifications({ args: [], service: dryRun, ...common, lease: busy })
    ).toBe(0);
    expect(busy).toHaveBeenCalledOnce();
  });

  it('J-09 o worker e os comandos só importam arquivos que o artefato exporta', () => {
    const files = closureOf([
      'src/github-worker.js',
      'src/jobs/cli/notify-overdue-tasks.js',
      'src/jobs/cli/dispatch-github-event-notifications.js',
      'src/jobs/cli/reconcile-traceability-alerts.js',
      'src/jobs/cli/notification-metrics.js'
    ]);

    expect(files).toEqual(
      expect.arrayContaining([
        'src/jobs/job-runner.js',
        'src/jobs/job-lease.js',
        'src/jobs/scheduled-jobs.js',
        'src/jobs/scheduled-job-lease.repository.js'
      ])
    );
    expect(
      files.filter((file) => !ARTIFACT_PREFIXES.some((prefix) => file.startsWith(prefix)))
    ).toEqual([]);
  });
});
