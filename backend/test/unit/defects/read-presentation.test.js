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
