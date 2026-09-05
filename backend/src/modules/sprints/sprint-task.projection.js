import { isTerminalSprintStatus } from './sprint.schema.js';
import { buildSprintHistoricalSummary } from './sprint.summary.calculator.js';

// Deliberately excludes description, names/emails and linked artifact contents.
// Status, effort and cutoff already have their own historical fields.
export function buildClosingTaskSnapshot(task) {
  return {
    version: 1,
    id: task.id,
    title: task.title,
    priority: task.priority,
    responsibleUserId: task.responsibleUserId,
    deadline: task.deadline?.toISOString() ?? null,
    traceabilityCounts: {
      requirements: task.requirementId ? 1 : 0,
      pullRequests: task.pullRequestId ? 1 : 0,
      commits: task._count.commitLinks,
      issues: task._count.issueLinks
    }
  };
}

export function projectSprintTasks(sprint, participations) {
  const isFrozen = isTerminalSprintStatus(sprint.status);
  const historicalSummary = buildSprintHistoricalSummary(sprint, participations);
  const historicalLimitations = new Set(historicalSummary?.historicalLimitations ?? []);
  const tasks = participations
    .filter((p) => p.removedAt === null)
    .flatMap((p) => {
      const context = {
        addedAt: p.addedAt,
        addedAfterStart: p.addedAfterStart,
        carriedFromSprintId: p.carriedFromSprintId,
        exitStatus: p.exitStatus
      };
      if (!isFrozen) return p.task ? [{ ...p.task, ...context, isFrozen: false }] : [];
      const snapshot = p.closingTaskSnapshot?.version === 1 ? p.closingTaskSnapshot : null;
      if (!snapshot) historicalLimitations.add('LEGACY_CLOSING_TASK_SNAPSHOT_UNAVAILABLE');
      return [
        {
          ...context,
          id: snapshot?.id ?? p.taskId ?? `historical-${p.id}`,
          participationId: p.id,
          currentTaskId: p.taskId,
          sprintId: sprint.id,
          isFrozen: true,
          snapshotAt: p.closedAt ?? historicalSummary.cutoff,
          snapshotAvailable: Boolean(snapshot),
          title:
            snapshot?.title ??
            `Tarefa ${p.taskId ? `#${p.taskId}` : 'excluída'} — título no encerramento indisponível`,
          status: p.exitStatus,
          estimatedEffort: p.pointsAtClose,
          priority: snapshot?.priority ?? null,
          responsibleUserId: snapshot?.responsibleUserId ?? null,
          deadline: snapshot?.deadline ?? null,
          traceabilityCounts: snapshot?.traceabilityCounts ?? null
        }
      ];
    });
  return {
    sprintId: sprint.id,
    isFrozen,
    snapshotAt: historicalSummary?.cutoff ?? null,
    historicalSummary,
    historicalLimitations: [...historicalLimitations],
    total: tasks.length,
    tasks
  };
}
