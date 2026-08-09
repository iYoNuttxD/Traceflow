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
  toDateOnlyString
} from '../sprint.calculator.js';
import { parseCalendarDate, parseProjectId, ensureDateRange } from '../sprint.schema.js';
import { ensureProjectExists } from './sprint-crud.service.js';

function formatScheduleTask(task, sprint) {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    deadline: toDateOnlyString(task.deadline),
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

    const from = parseCalendarDate(query.from, 'Data inicial');
    const to = parseCalendarDate(query.to, 'Data final');
    ensureDateRange(from, to);
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
        startDate: toDateOnlyString(sprint.startDate),
        endDate: toDateOnlyString(sprint.endDate),
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
        dueDate: toDateOnlyString(milestone.dueDate),
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
      range: { from: toDateOnlyString(from), to: toDateOnlyString(to) },
      generatedAt: generatedAt.toISOString(),
      sprints,
      milestones,
      unassignedTasks
    };
  }
};
