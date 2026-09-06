import { buildEffortSummary } from '../tasks/services/task-time-entry.presenter.js';

const round2 = (value) => Math.round(value * 100) / 100;
const present = (value) => value !== null && value !== undefined;

function taskStatus(row) {
  return buildEffortSummary({
    estimatedHours: present(row.estimatedHours) ? row.estimatedHours : null,
    completedSeconds: Math.round((row.actualHours ?? 0) * 3600),
    completedCount: present(row.actualHours) ? 1 : 0
  }).status;
}

// Consolidação por sprint (S1-06 sobre o RF35): soma das estimativas e do realizado
// das tarefas que compõem a sprint. Tarefa sem estimativa não entra no limite, mas
// o realizado dela entra no total — falta de plano nunca esconde um estouro.
export function buildSprintEffort(rows = []) {
  const withEstimate = rows.filter((row) => present(row.estimatedHours));
  const withActual = rows.filter((row) => present(row.actualHours));
  const estimatedHours = withEstimate.length
    ? round2(withEstimate.reduce((sum, row) => sum + Number(row.estimatedHours), 0))
    : null;
  const actualHours = round2(withActual.reduce((sum, row) => sum + Number(row.actualHours), 0));
  const summary = buildEffortSummary({
    estimatedHours,
    completedSeconds: Math.round(actualHours * 3600),
    completedCount: withActual.length
  });
  return {
    unit: 'HOURS',
    tasks: rows.length,
    tasksWithEstimate: withEstimate.length,
    tasksWithActual: withActual.length,
    estimatedHours,
    actualHours,
    differenceHours: summary.differenceHours,
    differencePercent: summary.differencePercent,
    usagePercent: summary.usagePercent,
    status: summary.status,
    perTask: [...rows]
      .sort((a, b) => (a.taskId ?? 0) - (b.taskId ?? 0))
      .map((row) => ({
        taskId: row.taskId ?? null,
        estimatedHours: present(row.estimatedHours) ? row.estimatedHours : null,
        actualHours: present(row.actualHours) ? row.actualHours : null,
        status: taskStatus(row)
      }))
  };
}
