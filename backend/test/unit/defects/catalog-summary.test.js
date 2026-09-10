import { expect, it } from 'vitest';
import { defectCard } from '../../../src/modules/defects/defect.presenter.js';
it.each(
  [
    [],
    [{ id: 1, status: 'A_FAZER' }],
    [
      { id: 1, status: 'CONCLUIDO' },
      { id: 2, status: 'EM_ANDAMENTO' },
      { id: 3, status: 'A_FAZER' }
    ]
  ].map((tasks) => [tasks])
)('summarizes only current-cycle corrections: %j', (tasks) => {
  const row = defectCard({
    id: 4,
    currentCorrectionCycle: 2,
    taskLinks: [
      { correctionCycle: 1, task: { id: 9, status: 'CONCLUIDO' } },
      ...tasks.map((task) => ({ correctionCycle: 2, task }))
    ]
  });
  expect(row.correctionTaskCount).toBe(tasks.length);
  expect(row.correctionSummary.total).toBe(tasks.length);
  expect(row.correctionSummary.done).toBe(tasks.filter((t) => t.status === 'CONCLUIDO').length);
  expect(row.correctionSummary.inProgress).toBe(
    tasks.filter((t) => t.status === 'EM_ANDAMENTO').length
  );
  expect(row.correctionSummary.todo).toBe(tasks.filter((t) => t.status === 'A_FAZER').length);
  expect(row.correctionSummary.singleTask).toEqual(tasks.length === 1 ? tasks[0] : null);
  expect(row).not.toHaveProperty('taskLinks');
});
