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
import { buildSprintHistoricalSummary } from '../sprint.summary.calculator.js';

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
    estimatedEffort: task.estimatedEffort ?? null,
    responsibleUserId: task.responsibleUserId ?? null,
    sprintId: task.sprintId ?? null,
    ...(sprint
      ? {
          deadlineOutsideWindow: isDeadlineOutsideWindow(
            task.deadline,
            sprint.startDate,
            sprint.endDate
          ),
          addedAfterStart: task.addedAfterStart ?? false,
          carriedFromSprintId: task.carriedFromSprintId ?? null
        }
      : {})
  };
}

export const scheduleService = {
  async getSchedule(projectId, query = {}) {
    const parsedProjectId = parseProjectId(projectId);
    await ensureProjectExists(parsedProjectId);

    const from = parseWindowDay(query.from, 'Data inicial');
    const toDay = parseWindowDay(query.to, 'Data final');
    ensureWindowOrder(from, toDay);
    const to = nextUtcDay(toDay);
    const hasRange = Boolean(from || to);

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
        planningSnapshotAt: sprint.planningSnapshotAt,
        closedAt: sprint.closedAt,
        historicalSummary: buildSprintHistoricalSummary(sprint, sprint.sprintTasks),
        milestoneId: sprint.milestoneId ?? null,
        milestone: sprint.milestone ?? null,
        durationInDays: durationInDays(sprint.startDate, sprint.endDate),
        taskCount: sprint.sprintTasks.filter((p) => p.removedAt === null).length,
        tasks: sprint.sprintTasks
          .filter((p) => p.removedAt === null && p.task)
          .map((participation) =>
            formatScheduleTask(
              {
                ...participation.task,
                addedAfterStart: participation.addedAfterStart,
                carriedFromSprintId: participation.carriedFromSprintId
              },
              sprint
            )
          )
      }));

    const milestones = milestonesRaw
      .filter((milestone) => !hasRange || isWithinRange(milestone.dueDate, from, to))
      .map((milestone) => ({
        id: milestone.id,
        title: milestone.title,
        description: milestone.description,
        dueDate: toIsoString(milestone.dueDate),
        status: milestone.status,
        overdue: isMilestoneOverdue(milestone.status, milestone.dueDate, generatedAt)
      }));

    const unassignedTasks = unassignedRaw
      .filter((task) => !hasRange || isWithinRange(task.deadline, from, to))
      .map((task) => formatScheduleTask(task, null));

    return {
      projectId: parsedProjectId,
      range: { from: toDateOnlyString(from), to: toDateOnlyString(toDay) },
      generatedAt: generatedAt.toISOString(),
      sprints,
      milestones,
      unassignedTasks
    };
  }
};
