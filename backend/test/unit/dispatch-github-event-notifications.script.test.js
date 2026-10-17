import { describe, expect, it, vi } from 'vitest';
import {
  parseGithubEventNotificationArguments,
  runGithubEventNotifications
} from '../../src/jobs/cli/dispatch-github-event-notifications.js';

const LOCAL = 'mysql://user:password@localhost:3306/traceflow';
const PRODUCTION = 'mysql://user:password@db.traceflow.example:3306/traceflow_prod';

function fakeService(report = {}, { activeProject = true } = {}) {
  return {
    isActiveProject: vi.fn(async () => activeProject),
    runJob: vi.fn(async () => ({ failed: 0, retryScheduled: 0, created: 0, ...report }))
  };
}

const lease = async (_name, work) => ({
  acquired: true,
  result: await work(new AbortController().signal)
});

const run = (args, service, databaseUrl = LOCAL) => {
  const write = vi.fn();
  const writeError = vi.fn();
  return runGithubEventNotifications({ args, service, databaseUrl, write, writeError, lease }).then(
    (code) => ({ code, write, writeError })
  );
};

describe('S2-03 script dispatch-github-event-notifications', () => {
  it('interpreta os argumentos com dry-run por padrão', () => {
    expect(parseGithubEventNotificationArguments([])).toEqual({
      projectId: null,
      dryRun: true,
      confirmProduction: false,
      retryFailed: false
    });
    expect(
      parseGithubEventNotificationArguments([
        '--apply',
        '--project-id=12',
        '--confirm-production',
        '--retry-failed'
      ])
    ).toEqual({ projectId: 12, dryRun: false, confirmProduction: true, retryFailed: true });
    expect(parseGithubEventNotificationArguments(['--dry-run', '--retry-failed'])).toMatchObject({
      dryRun: true,
      retryFailed: true
    });
    for (const args of [
      ['--apply', '--dry-run'],
      ['--project-id=0'],
      ['--project-id=2147483648'],
      ['--project-id=abc'],
      ['--project-id='],
      ['--force'],
      ['--retry']
    ])
      expect(() => parseGithubEventNotificationArguments(args)).toThrowError(/Uso/);
  });

  it('sai com 1 quando alguma tentativa falhou ou foi reagendada, e com 0 quando tudo passa', async () => {
    expect((await run(['--apply'], fakeService({ failed: 1 }))).code).toBe(1);
    expect((await run(['--apply'], fakeService({ retryScheduled: 2 }))).code).toBe(1);
    const passing = await run(['--apply'], fakeService({ created: 3 }));

    expect(passing.code).toBe(0);
    expect(JSON.parse(passing.write.mock.calls[0][0])).toMatchObject({
      created: 3,
      database: expect.any(Object)
    });
    expect(passing.write.mock.calls.join('')).not.toContain('password');
  });

  it('passa projeto, modo e reprocessamento ao serviço', async () => {
    const service = fakeService();

    await run(['--apply', '--project-id=7', '--retry-failed'], service);

    expect(service.isActiveProject).toHaveBeenCalledWith(7);
    expect(service.runJob).toHaveBeenCalledWith({
      projectId: 7,
      dryRun: false,
      retryFailed: true,
      signal: expect.any(AbortSignal)
    });
  });

  it('sai com 2 quando o --project-id não existe ou foi excluído, sem rodar o job', async () => {
    const service = fakeService({}, { activeProject: false });

    const result = await run(['--project-id=99'], service);

    expect(result.code).toBe(2);
    expect(service.runJob).not.toHaveBeenCalled();
    expect(result.writeError.mock.calls.join('')).toMatch(/--project-id=99/);
  });

  it('exige --confirm-production para gravar em produção, antes de conferir o projeto', async () => {
    const service = fakeService({}, { activeProject: false });

    const refused = await run(['--apply', '--project-id=99'], service, PRODUCTION);
    const confirmed = await run(['--apply', '--confirm-production'], fakeService(), PRODUCTION);

    expect(refused.code).toBe(1);
    expect(service.isActiveProject).not.toHaveBeenCalled();
    expect(service.runJob).not.toHaveBeenCalled();
    expect(refused.writeError.mock.calls.join('')).toMatch(/--confirm-production/);
    expect(confirmed.code).toBe(0);
  });

  it('erro inesperado sai com 1 e mensagem genérica, sem o texto cru', async () => {
    const service = fakeService();
    service.runJob.mockRejectedValue(
      Object.assign(new Error('Título sigiloso no erro do banco'), { code: 'P2034' })
    );

    const result = await run(['--apply'], service);

    expect(result.code).toBe(1);
    expect(result.writeError.mock.calls.join('')).not.toContain('sigiloso');
    expect(result.writeError.mock.calls.join('')).toMatch(/Despacho/);
  });
});
