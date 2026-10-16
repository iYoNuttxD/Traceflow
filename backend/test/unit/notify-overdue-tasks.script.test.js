import { describe, expect, it, vi } from 'vitest';
import { createNotificationService } from '../../src/modules/notifications/notification.service.js';
import {
  parseOverdueNotificationArguments,
  runOverdueNotifications
} from '../../scripts/notify-overdue-tasks.js';

const NOW = new Date('2026-10-20T12:00:00.000Z');
const SECRET_TITLE = 'Título sigiloso\r\n{"level":"error","forjado":true}';

function fakeRepository({ failingProjectId } = {}) {
  return {
    listActiveProjectIds: vi.fn(async (projectId) => (projectId ? [projectId] : [1, 2])),
    findOverdueCandidates: vi.fn(async (projectId) => {
      if (projectId === failingProjectId) {
        const error = new Error('Deadlock found when trying to get lock');
        error.code = 'P2034';
        throw error;
      }
      return [
        {
          id: projectId * 10,
          title: SECRET_TITLE,
          deadline: new Date('2026-10-15T00:00:00.000Z'),
          responsibleUserId: 7
        }
      ];
    }),
    countOutsideWindow: vi.fn(async () => 0),
    activeAccountIds: vi.fn(async (userIds) => new Set(userIds)),
    activeMemberIds: vi.fn(async () => new Set([7])),
    overduePreferences: vi.fn(async () => new Map()),
    existingOverdueKeys: vi.fn(async () => new Set()),
    insertOverdue: vi.fn(async (rows) => rows.length)
  };
}

function fakeLog() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

const job = (repository, log) =>
  createNotificationService({
    repository,
    log,
    clock: () => NOW,
    configuration: { appTimeZone: 'America/Sao_Paulo' }
  });

describe('S2-02 job de vencimento: falhas e contagens (N15, §13.10)', () => {
  it('N15 a falha de um projeto conta em failed e não impede o outro', async () => {
    const repository = fakeRepository({ failingProjectId: 1 });
    const log = fakeLog();

    const report = await job(repository, log).notifyOverdueTasks({ dryRun: false });

    expect(report).toMatchObject({
      projects: 2,
      failed: 1,
      eligible: 1,
      created: 1,
      alreadyNotified: 0,
      updated: 'NOT_APPLICABLE',
      timeZone: 'America/Sao_Paulo'
    });
    expect(report).not.toHaveProperty('lookbackDays');
    expect(repository.insertOverdue).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        event: 'notifications_due_project_failed',
        projectId: 1,
        errorCode: 'P2034'
      })
    );
  });

  it('informa as exclusões por motivo e nunca registra título, nome ou mensagem crua', async () => {
    const repository = fakeRepository();
    repository.activeMemberIds.mockResolvedValue(new Set());
    const log = fakeLog();

    const report = await job(repository, log).notifyOverdueTasks({ dryRun: false });

    expect(report.excluded).toEqual({
      NO_RESPONSIBLE: 0,
      INACTIVE_ACCOUNT: 0,
      INACTIVE_MEMBER: 2,
      PREFERENCE_OFF: 0
    });
    const logged = JSON.stringify([log.info.mock.calls, log.warn.mock.calls, log.error.mock.calls]);
    expect(logged).not.toContain('sigiloso');
    expect(logged).not.toContain('forjado');
    expect(logged).toContain('America/Sao_Paulo');
  });

  it('o dry-run não grava e calcula o que criaria', async () => {
    const repository = fakeRepository();
    repository.existingOverdueKeys.mockResolvedValue(new Set(['7|TASK_OVERDUE:10:2026-10-15']));

    const report = await job(repository, fakeLog()).notifyOverdueTasks({ dryRun: true });

    expect(repository.insertOverdue).not.toHaveBeenCalled();
    expect(report).toMatchObject({
      dryRun: true,
      eligible: 2,
      created: 0,
      alreadyNotified: 1,
      wouldCreate: 1
    });
  });
});

describe('S2-02 script notify-overdue-tasks', () => {
  it('interpreta os argumentos com dry-run por padrão', () => {
    expect(parseOverdueNotificationArguments([])).toEqual({
      projectId: null,
      dryRun: true,
      confirmProduction: false
    });
    expect(
      parseOverdueNotificationArguments(['--apply', '--project-id=12', '--confirm-production'])
    ).toEqual({ projectId: 12, dryRun: false, confirmProduction: true });
    for (const args of [
      ['--apply', '--dry-run'],
      ['--project-id=0'],
      ['--project-id=abc'],
      ['--force']
    ])
      expect(() => parseOverdueNotificationArguments(args)).toThrowError(/Uso/);
  });

  it('termina com código 1 quando algum projeto falha e 0 quando tudo passa', async () => {
    const write = vi.fn();
    const failing = { notifyOverdueTasks: vi.fn(async () => ({ failed: 1, created: 0 })) };
    const passing = { notifyOverdueTasks: vi.fn(async () => ({ failed: 0, created: 2 })) };
    const databaseUrl = 'mysql://user:password@localhost:3306/traceflow';

    expect(
      await runOverdueNotifications({ args: ['--apply'], service: failing, databaseUrl, write })
    ).toBe(1);
    expect(
      await runOverdueNotifications({ args: ['--apply'], service: passing, databaseUrl, write })
    ).toBe(0);
    expect(JSON.parse(write.mock.calls[1][0])).toMatchObject({
      created: 2,
      database: expect.any(Object)
    });
    expect(write.mock.calls.join('')).not.toContain('password');
  });

  it('exige --confirm-production para gravar em produção', async () => {
    const service = { notifyOverdueTasks: vi.fn() };
    const write = vi.fn();
    const writeError = vi.fn();
    const databaseUrl = 'mysql://user:password@db.traceflow.example:3306/traceflow_prod';

    const code = await runOverdueNotifications({
      args: ['--apply'],
      service,
      databaseUrl,
      write,
      writeError
    });

    expect(code).toBe(1);
    expect(service.notifyOverdueTasks).not.toHaveBeenCalled();
    expect(writeError.mock.calls.join('')).toMatch(/--confirm-production/);
  });
});
