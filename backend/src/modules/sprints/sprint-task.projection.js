import { isTerminalSprintStatus } from './sprint.schema.js';
import { buildSprintHistoricalSummary } from './sprint.summary.calculator.js';

// Whitelist only the information rendered by Task Details. Never copy comments,
// user profiles, author emails or internal integration payloads into history.
export function buildClosingTaskSnapshot(task) {
  if (!task) throw new Error('Closing Task snapshot requires an active Task');
  return {
    version: 2,
    id: task.id,
    title: task.title,
    description: task.description,
    priority: task.priority,
    responsibleUserId: task.responsibleUserId,
    responsibleDisplayName: task.responsibleUser?.name || task.responsible || null,
    deadline: task.deadline?.toISOString() ?? null,
    actualEffort: task.actualEffort,
    createdAt: task.createdAt.toISOString(),
    requirement: task.requirement,
    pullRequest: task.pullRequest,
    commits: task.commitLinks.map(({ commit }) => ({
      id: commit.id,
      hash: commit.hash,
      message: commit.message,
      authorName: commit.authorName || commit.authorUsername || null,
      date: commit.date.toISOString(),
      githubUrl: commit.githubUrl
    })),
    issues: task.issueLinks.map(({ issue }) => issue),
    traceabilityCounts: {
      requirements: task.requirement ? 1 : 0,
      pullRequests: task.pullRequest ? 1 : 0,
      commits: task.commitLinks.length,
      issues: task.issueLinks.length
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
      const snapshot = [1, 2].includes(p.closingTaskSnapshot?.version)
        ? p.closingTaskSnapshot
        : null;
      if (!snapshot) historicalLimitations.add('LEGACY_CLOSING_TASK_SNAPSHOT_UNAVAILABLE');
      else if (snapshot.version === 1)
        historicalLimitations.add('LEGACY_CLOSING_TASK_DETAILS_PARTIAL');
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
          snapshotVersion: snapshot?.version ?? null,
          ...(snapshot?.version === 2
            ? {
                description: snapshot.description,
                responsibleDisplayName: snapshot.responsibleDisplayName,
                actualEffort: snapshot.actualEffort,
                createdAt: snapshot.createdAt,
                requirement: snapshot.requirement,
                pullRequest: snapshot.pullRequest,
                commits: snapshot.commits,
                issues: snapshot.issues
              }
            : {}),
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
