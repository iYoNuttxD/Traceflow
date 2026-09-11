import { beforeEach, describe, expect, it, vi } from 'vitest';

// Ordem dos locks das operações de esforço. Planning trava Project → Sprint → Task
// (sprint.repository.js); começar pela Task fecha o ciclo, porque gravar a sessão
// trava o Project pela FK de qualquer forma, e o cronômetro morria com deadlock
// sempre que uma transição de sprint corria junto (TF-REV-001).
const locks = [];

function tableOf(strings) {
  const sql = strings.join(' ');
  const match = /FROM\s+(\w+)/i.exec(sql);
  return /FOR UPDATE/i.test(sql) && match ? match[1] : null;
}

const entry = {
  id: 1,
  taskId: 42,
  source: 'TIMER',
  startedAt: new Date('2026-01-01T10:00:00Z'),
  endedAt: null,
  durationSeconds: null
};

function fakeTx() {
  return {
    $queryRaw: vi.fn(async (strings) => {
      const table = tableOf(strings);
      if (table) locks.push(table);
      return table === 'Task' ? [{ id: 42 }] : [{ id: 7 }];
    }),
    taskTimeEntry: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => entry),
      update: vi.fn(async () => ({ ...entry, endedAt: new Date(), durationSeconds: 60 })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
      aggregate: vi.fn(async () => ({ _sum: { durationSeconds: 0 }, _count: { id: 0 } }))
    },
    task: {
      findUnique: vi.fn(async () => ({ legacyActualEffort: null })),
      update: vi.fn(async () => ({}))
    }
  };
}

vi.mock('../../src/database/prismaClient.js', () => ({
  prisma: { $transaction: vi.fn(async (run) => run(fakeTx())) }
}));

vi.mock('../../src/modules/audit/audit.repository.js', () => ({
  auditRepository: { create: vi.fn(async () => ({})) }
}));

const { taskTimeEntryRepository } = await import(
  '../../src/modules/tasks/repositories/task-time-entry.repository.js'
);

describe('ordem de locks das sessões de tempo', () => {
  beforeEach(() => {
    locks.length = 0;
  });

  it('iniciar trava Project antes de Task', async () => {
    await taskTimeEntryRepository.startAtomic({
      projectId: 7,
      taskId: 42,
      startedById: 9,
      startedAt: new Date()
    });
    expect(locks).toEqual(['Project', 'Task']);
  });

  it('parar trava Project antes de Task', async () => {
    await taskTimeEntryRepository.stopAtomic(42, {
      projectId: 7,
      endedById: 9,
      endedAt: new Date()
    });
    expect(locks).toEqual(['Project', 'Task']);
  });

  it('lançamento manual trava Project antes de Task', async () => {
    await taskTimeEntryRepository.createManualAtomic({
      projectId: 7,
      taskId: 42,
      startedById: 9,
      endedById: 9,
      startedAt: new Date(),
      endedAt: new Date(),
      durationSeconds: 3600
    });
    expect(locks).toEqual(['Project', 'Task']);
  });

  it('exclusão trava Project antes de Task', async () => {
    await taskTimeEntryRepository.deleteAtomic(42, 1, null, 7);
    expect(locks).toEqual(['Project', 'Task']);
  });
});
