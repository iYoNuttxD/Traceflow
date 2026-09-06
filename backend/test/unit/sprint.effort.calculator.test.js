import { describe, expect, it } from 'vitest';
import { buildSprintEffort } from '../../src/modules/sprints/sprint.effort.calculator.js';

describe('buildSprintEffort — consolidação por sprint (S1-06)', () => {
  it('soma estimativas e realizado das tarefas e classifica a sprint', () => {
    const effort = buildSprintEffort([
      { taskId: 3, estimatedHours: 8, actualHours: 3.5 },
      { taskId: 1, estimatedHours: 2, actualHours: 4 },
      { taskId: 2, estimatedHours: 5, actualHours: null }
    ]);
    expect(effort).toMatchObject({
      unit: 'HOURS',
      tasks: 3,
      tasksWithEstimate: 3,
      tasksWithActual: 2,
      estimatedHours: 15,
      actualHours: 7.5,
      differenceHours: -7.5,
      differencePercent: -50,
      usagePercent: 50,
      status: 'DENTRO_DO_PREVISTO'
    });
    expect(effort.perTask.map((task) => task.taskId)).toEqual([1, 2, 3]);
    expect(effort.perTask[0]).toMatchObject({
      estimatedHours: 2,
      actualHours: 4,
      status: 'ESTOURADO'
    });
    expect(effort.perTask[1]).toMatchObject({
      estimatedHours: 5,
      actualHours: null,
      status: 'DENTRO_DO_PREVISTO'
    });
  });

  it('tarefa sem estimativa não entra no limite, mas o realizado dela entra no total', () => {
    const effort = buildSprintEffort([
      { taskId: 1, estimatedHours: 2, actualHours: 1 },
      { taskId: 2, estimatedHours: null, actualHours: 3 }
    ]);
    expect(effort).toMatchObject({
      estimatedHours: 2,
      actualHours: 4,
      tasksWithEstimate: 1,
      status: 'ESTOURADO',
      usagePercent: 200
    });
    expect(effort.perTask[1].status).toBe('SEM_ESTIMATIVA');
  });

  it('sprint sem nenhuma estimativa fica sem limite e sprint vazia zera os totais', () => {
    expect(buildSprintEffort([{ taskId: 1, estimatedHours: null, actualHours: 2 }])).toMatchObject({
      estimatedHours: null,
      actualHours: 2,
      usagePercent: null,
      differenceHours: null,
      status: 'SEM_ESTIMATIVA'
    });
    expect(buildSprintEffort([])).toMatchObject({
      tasks: 0,
      estimatedHours: null,
      actualHours: 0,
      status: 'SEM_ESTIMATIVA',
      perTask: []
    });
  });
});
