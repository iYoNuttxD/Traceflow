// Agregacao somente-leitura da visao de cronograma (RF10).
// Nenhum calculo de planejado, concluido ou percentual: isso e RF35.
import { sprintRepository } from '../repositories/sprint.repository.js';
import { milestoneRepository } from '../repositories/milestone.repository.js';
import {
  durationInDays,
  intersectsRange,
  isDeadlineOutsideWindow,
  isMilestoneOverdue,
  isWithinRange,
  toDateOnlyString,
  toIsoString
} from '../sprint.calculator.js';
import {
  SprintServiceError,
  nextUtcDay,
  parseProjectId,
  parseWindowDay
} from '../sprint.schema.js';
import { ERROR_CODES } from '../../../shared/errors/index.js';
import { ensureProjectExists } from './sprint-crud.service.js';

function ensureWindowOrder(from, to) {
  if (from && to && from.getTime() > to.getTime()) {
    throw new SprintServiceError(
      'A data inicial não pode ser maior que a data final.',
      400,
      ERROR_CODES.SPRINT_DATE_RANGE_INVALID
    );
  }
}

function formatScheduleTask(task, sprint) {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    deadline: toIsoString(task.deadline),
    responsibleUserId: task.responsibleUserId ?? null,
    ...(sprint
      ? {
          deadlineOutsideWindow: isDeadlineOutsideWindow(
            task.deadline,
            sprint.startDate,
            sprint.endDate
          )
        }
      : {})
  };
}

export const scheduleService = {
  async getSchedule(projectId, query = {}) {
    const parsedProjectId = parseProjectId(projectId);
    await ensureProjectExists(parsedProjectId);

    // A janela continua sendo dia de calendario (D15). `from` e o inicio do dia
    // pedido; `to` vira o inicio do dia SEGUINTE, para que filtrar "até 14/08"
    // inclua o dia 14 inteiro e nao pare na sua meia-noite.
    const from = parseWindowDay(query.from, 'Data inicial');
    const toDay = parseWindowDay(query.to, 'Data final');
    // A comparacao acontece antes de tornar `to` exclusivo: from == to e uma
    // janela de um dia, valida, e so from > to e erro.
    ensureWindowOrder(from, toDay);
    const to = nextUtcDay(toDay);
    const hasRange = Boolean(from || to);

    // O instante de consulta e capturado uma unica vez e injetado no calculator,
    // que permanece puro e testavel de forma deterministica.
    const generatedAt = new Date();

    const [sprintsRaw, unassignedRaw] = await sprintRepository.scheduleData(parsedProjectId);
    const milestonesRaw = await milestoneRepository.findByProject(parsedProjectId);

    const sprints = sprintsRaw
      .filter((sprint) => !hasRange || intersectsRange(sprint.startDate, sprint.endDate, from, to))
      .map((sprint) => ({
        id: sprint.id,
        name: sprint.name,
        objective: sprint.objective,
        startDate: toIsoString(sprint.startDate),
        endDate: toIsoString(sprint.endDate),
        status: sprint.status,
        startedAt: sprint.startedAt,
        completedAt: sprint.completedAt,
        durationInDays: durationInDays(sprint.startDate, sprint.endDate),
        taskCount: sprint.tasks.length,
        tasks: sprint.tasks.map((task) => formatScheduleTask(task, sprint))
      }));

    const milestones = milestonesRaw
      .filter((milestone) => !hasRange || isWithinRange(milestone.dueDate, from, to))
      .map((milestone) => ({
        id: milestone.id,
        title: milestone.title,
        description: milestone.description,
        sprintId: milestone.sprintId,
        dueDate: toIsoString(milestone.dueDate),
        status: milestone.status,
        overdue: isMilestoneOverdue(milestone.status, milestone.dueDate, generatedAt)
      }));

    // Com janela, tarefa sem sprint entra apenas se tiver prazo dentro do periodo.
    // Tarefa sem sprint e sem prazo so aparece quando nao ha filtro.
    const unassignedTasks = unassignedRaw
      .filter((task) => !hasRange || isWithinRange(task.deadline, from, to))
      .map((task) => formatScheduleTask(task, null));

    return {
      projectId: parsedProjectId,
      // A janela devolvida repete o que o usuario pediu: dia de calendario, com
      // `to` inclusivo. O fim exclusivo e detalhe interno da comparacao.
      range: { from: toDateOnlyString(from), to: toDateOnlyString(toDay) },
      generatedAt: generatedAt.toISOString(),
      sprints,
      milestones,
      unassignedTasks
    };
  }
};
