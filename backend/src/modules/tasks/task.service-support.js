import { taskRepository } from './task.repository.js';
import { TaskServiceError, parseRequirementId } from './task.schema.js';

export async function ensureProjectExists(projectId) {
  const project = await taskRepository.findProjectById(projectId);
  if (!project) throw new TaskServiceError('Projeto não encontrado.', 404);
  return project;
}
export async function ensureTaskExists(taskId) {
  const task = await taskRepository.findTaskById(taskId);
  if (!task) throw new TaskServiceError('Tarefa não encontrada.', 404);
  return task;
}
export async function ensurePullRequestExists(id) {
  const value = await taskRepository.findPullRequestById(id);
  if (!value) throw new TaskServiceError('Pull request não encontrado.', 404);
  return value;
}
export async function ensureRequirementExists(id) {
  const value = await taskRepository.findRequirementById(id);
  if (!value) throw new TaskServiceError('Requisito não encontrado.', 404);
  return value;
}
export async function ensureCommitExists(id) {
  const value = await taskRepository.findCommitById(id);
  if (!value) throw new TaskServiceError('Commit não encontrado.', 404);
  return value;
}
export async function ensureIssueExists(id) {
  const value = await taskRepository.findIssueById(id);
  if (!value) throw new TaskServiceError('Issue não encontrada.', 404);
  return value;
}

export function formatCommit(commit) {
  return commit ? { ...commit, shortHash: commit.hash ? commit.hash.slice(0, 7) : null } : null;
}
export function formatIssue(issue) {
  return issue || null;
}
export function formatTask(task) {
  if (!task) return task;
  const { commitLinks = [], issueLinks = [], ...taskData } = task;
  return {
    ...taskData,
    responsible: taskData.responsibleUser?.name || taskData.responsible || null,
    pullRequest: taskData.pullRequest || null,
    commits: commitLinks.map((link) => formatCommit(link.commit)).filter(Boolean),
    issues: issueLinks.map((link) => formatIssue(link.issue)).filter(Boolean)
  };
}

export async function resolveRequirementForTask(projectId, requirementId) {
  if (requirementId === undefined) return undefined;
  if (requirementId === null || requirementId === '') return null;
  const parsedRequirementId = parseRequirementId(requirementId);
  const requirement = await ensureRequirementExists(parsedRequirementId);
  if (requirement.projectId !== projectId) {
    throw new TaskServiceError(
      'O requisito informado não pertence ao mesmo projeto da tarefa.',
      400
    );
  }
  return parsedRequirementId;
}

export async function resolveResponsibleUser(projectId, userId) {
  if (userId === undefined) return undefined;
  if (userId === null || userId === '') return null;
  const parsed = Number(userId);
  const membership =
    Number.isInteger(parsed) && parsed > 0
      ? await taskRepository.findActiveMembership(projectId, parsed)
      : null;
  if (!membership) throw new TaskServiceError('Usuário responsável não pertence ao projeto.', 400);
  return parsed;
}

export function formatMovement(movement) {
  return {
    id: movement.id,
    taskId: movement.taskId,
    taskTitle: movement.task?.title || null,
    fromStatus: movement.fromStatus,
    toStatus: movement.toStatus,
    projectMemberId: null,
    movedBy: movement.movedByUser?.name || movement.movedBy,
    movedByUser: movement.movedByUser || null,
    movedAt: movement.movedAt,
    ...(movement.sprintId ? { sprintId: movement.sprintId } : {})
  };
}

export function historyValue(value, field) {
  if (value === undefined || value === null || value === '') return null;
  if (field === 'DEADLINE') return new Date(value).toISOString();
  return String(value);
}

export function buildTaskHistoryChanges(current, next) {
  const definitions = [
    ['deadline', 'DEADLINE'],
    ['responsibleUserId', 'RESPONSIBLE'],
    ['priority', 'PRIORITY']
  ];
  return definitions.flatMap(([property, field]) => {
    if (!(property in next)) return [];
    const fromValue = historyValue(current[property], field);
    const toValue = historyValue(next[property], field);
    return fromValue === toValue ? [] : [{ field, fromValue, toValue }];
  });
}
