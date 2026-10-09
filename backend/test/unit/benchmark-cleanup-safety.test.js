import { spawnSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { cleanupIndicatorBenchmark } from '../../scripts/lib/benchmark-cleanup.js';

const run = '7c9ce352-1882-4c42-9f46-d5a46d23fd57';
const options = {
  project: { id: 901 },
  user: { id: 902 },
  run,
  databaseUrl: 'mysql://fixture:fixture@localhost/traceflow_test',
  nodeEnv: 'test'
};
function fixture({ databaseName = 'traceflow_test', ownedProject = true, ownedUser = true } = {}) {
  const deleteMany = vi.fn();
  const deleteProject = vi.fn();
  const deleteUser = vi.fn();
  const tx = new Proxy(
    {
      $queryRaw: vi.fn().mockResolvedValue([{ databaseName }]),
      project: {
        findFirst: vi.fn().mockResolvedValue(ownedProject ? options.project : null),
        delete: deleteProject
      },
      user: {
        findFirst: vi.fn().mockResolvedValue(ownedUser ? options.user : null),
        delete: deleteUser
      }
    },
    { get: (target, key) => (key in target ? target[key] : { deleteMany }) }
  );
  const prisma = { $transaction: vi.fn((callback) => callback(tx)) };
  return { prisma, tx, writes: [deleteMany, deleteProject, deleteUser], deleteMany };
}

describe('benchmark cleanup scope, using simulated clients only', () => {
  it.each(['traceflow', 'another_test', '', undefined])(
    'refuses the actual connection %s without issuing any delete',
    async (databaseName) => {
      const f = fixture({ databaseName: databaseName ?? null });
      await expect(cleanupIndicatorBenchmark(f.prisma, options)).rejects.toThrow('connection');
      for (const write of f.writes) expect(write).not.toHaveBeenCalled();
    }
  );

  it.each([{}, { id: undefined }, { id: null }, { id: 0 }, { id: -1 }, { id: '901' }])(
    'refuses an invalid project scope: %j',
    async (project) => {
      const f = fixture();
      await expect(cleanupIndicatorBenchmark(f.prisma, { ...options, project })).rejects.toThrow(
        'fixture ID'
      );
      expect(f.prisma.$transaction).not.toHaveBeenCalled();
    }
  );

  it.each([{ ownedUser: false }, { ownedProject: false }])(
    'requires ownership of every fixture before any delete: %j',
    async (ownership) => {
      const f = fixture(ownership);
      await expect(cleanupIndicatorBenchmark(f.prisma, options)).rejects.toThrow('invocation');
      for (const write of f.writes) expect(write).not.toHaveBeenCalled();
    }
  );

  it('restricts every deletion to the verified invocation', async () => {
    const f = fixture();
    await cleanupIndicatorBenchmark(f.prisma, options);
    expect(f.prisma.$transaction).toHaveBeenCalledOnce();
    for (const [arg] of f.deleteMany.mock.calls) expect(arg).toEqual({ where: { projectId: 901 } });
    expect(f.tx.project.delete).toHaveBeenCalledExactlyOnceWith({ where: { id: 901 } });
    expect(f.tx.user.delete).toHaveBeenCalledExactlyOnceWith({ where: { id: 902 } });
    expect(f.tx.project.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
      f.deleteMany.mock.invocationCallOrder[0]
    );
  });

  it('can clean an owned user when project creation failed', async () => {
    const f = fixture();
    await cleanupIndicatorBenchmark(f.prisma, { ...options, project: undefined });
    expect(f.deleteMany).not.toHaveBeenCalled();
    expect(f.tx.project.delete).not.toHaveBeenCalled();
    expect(f.tx.user.delete).toHaveBeenCalledExactlyOnceWith({ where: { id: 902 } });
  });

  it.each([
    { nodeEnv: 'development' },
    { databaseUrl: 'mysql://fixture:fixture@localhost/traceflow' },
    { run: undefined },
    { user: undefined }
  ])('rejects unsafe cleanup arguments: %j', async (overrides) => {
    const f = fixture();
    await expect(
      cleanupIndicatorBenchmark(f.prisma, { ...options, ...overrides })
    ).rejects.toThrow();
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses benchmark execution without explicit --apply, before connecting', () => {
    const result = spawnSync(process.execPath, ['scripts/benchmark-indicators.js'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: '', TEST_DATABASE_URL: '' }
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Creating benchmark fixtures requires --apply');
  });
});
