import { buildEffortSummary } from '../tasks/services/task-time-entry.presenter.js';

const round2 = (value) => Math.round(value * 100) / 100;
const present = (value) => value !== null && value !== undefined;

// Uma linha só entra no limite quando a estimativa é conhecida, e só entra no
// realizado quando o valor foi de fato capturado. Snapshot antigo que não guardou
// esses campos é desconhecido, não zero.
const hasEstimate = (row) => !row.estimateUnknown && present(row.estimatedHours);
const hasActual = (row) => !row.actualUnknown && present(row.actualHours);

function taskStatus(row) {
  if (row.estimateUnknown || row.actualUnknown) return 'INDISPONIVEL';
  return buildEffortSummary({
    estimatedHours: hasEstimate(row) ? row.estimatedHours : null,
    completedSeconds: Math.round((row.actualHours ?? 0) * 3600),
    completedCount: hasActual(row) ? 1 : 0
  }).status;
}

// Consolidação por sprint (S1-06 sobre o RF35): soma das estimativas e do realizado
// das tarefas que compõem a sprint. Tarefa sem estimativa não entra no limite, mas
// o realizado dela entra no total — falta de plano nunca esconde um estouro.
// Quando alguma linha tem dado histórico indisponível, o agregado é publicado como
// incompleto e sem percentual ou status conclusivo, porque somar apenas o que se
// conhece faria um total parcial parecer completo.
export function buildSprintEffort(rows = []) {
  const withEstimate = rows.filter(hasEstimate);
  const withActual = rows.filter(hasActual);
  const unknownEstimate = rows.filter((row) => row.estimateUnknown);
  const unknownActual = rows.filter((row) => row.actualUnknown);
  const incomplete = unknownEstimate.length > 0 || unknownActual.length > 0;

  const estimatedHours = withEstimate.length
    ? round2(withEstimate.reduce((sum, row) => sum + Number(row.estimatedHours), 0))
    : null;
  const actualHours = round2(withActual.reduce((sum, row) => sum + Number(row.actualHours), 0));
  const summary = buildEffortSummary({
    estimatedHours,
    completedSeconds: Math.round(actualHours * 3600),
    completedCount: withActual.length,
    incomplete
  });

  return {
    unit: 'HOURS',
    tasks: rows.length,
    tasksWithEstimate: withEstimate.length,
    tasksWithActual: withActual.length,
    tasksWithUnknownEstimate: unknownEstimate.length,
    tasksWithUnknownActual: unknownActual.length,
    incomplete,
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
        estimatedHours: hasEstimate(row) ? row.estimatedHours : null,
        actualHours: hasActual(row) ? row.actualHours : null,
        estimateUnknown: Boolean(row.estimateUnknown),
        actualUnknown: Boolean(row.actualUnknown),
        status: taskStatus(row)
      }))
  };
}
