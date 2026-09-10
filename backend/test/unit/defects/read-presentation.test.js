import { expect, it, vi } from 'vitest';
import { createDefectRepository } from '../../../src/modules/defects/repositories/defect.repository.js';

it('reads correction identities and retest snapshots without exposing extra user fields', async () => {
  const findFirst = vi.fn().mockResolvedValue(null);
  await createDefectRepository({ defect: { findFirst } }).find(12);
  const query = findFirst.mock.calls[0][0];
  expect(query.where).toEqual({ id: 12, deletedAt: null });
  expect(query.include.taskLinks.include.task.select).toMatchObject({
    priority: true,
    responsibleUser: { select: { id: true, name: true } }
  });
  expect(Object.keys(query.include.taskLinks.include.task.select.responsibleUser.select)).toEqual([
    'id',
    'name'
  ]);
  expect(query.include.retests.include.execution.select).toMatchObject({
    environment: true,
    executedByDisplayNameSnapshot: true,
    testedReferenceSnapshot: true
  });
  expect(query.include.retests.include.execution.select).not.toHaveProperty('executedBy');
});

it('keeps catalog reads bounded and selects only task identity/status for summaries', async () => {
  const findMany = vi.fn().mockResolvedValue([]),
    count = vi.fn().mockResolvedValue(0),
    groupBy = vi.fn().mockResolvedValue([]);
  const taskRead = vi.fn();
  await createDefectRepository({
    defect: { findMany, count, groupBy },
    task: { findMany: taskRead }
  }).list(2, { page: 1, limit: 20 });
  expect(findMany).toHaveBeenCalledTimes(1);
  expect(count).toHaveBeenCalledTimes(1);
  expect(groupBy).toHaveBeenCalledTimes(1);
  expect(taskRead).not.toHaveBeenCalled();
  expect(findMany.mock.calls[0][0].include.taskLinks).toEqual({
    where: { relationType: 'CORRECTION' },
    select: { correctionCycle: true, task: { select: { id: true, status: true } } }
  });
});
