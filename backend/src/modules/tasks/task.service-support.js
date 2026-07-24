import { requirementService } from '../requirements/requirement.service.js';
import { taskRepository } from './task.repository.js';
import {
  TaskServiceError,
  normalizeMovedBy,
  parseProjectMemberId,
  parseRequirementId
} from './task.schema.js';

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

export async function recalculateRelatedRequirements(...requirementIds) {
  const uniqueIds = [...new Set(requirementIds.filter(Boolean).map(Number))];
  await Promise.all(uniqueIds.map((id) => requirementService.recalculateRequirementStatus(id)));
}

export async function resolveMovementResponsible(task, payload) {
  if (
    payload.projectMemberId !== undefined &&
    payload.projectMemberId !== null &&
    payload.projectMemberId !== ''
  ) {
    const id = parseProjectMemberId(payload.projectMemberId);
    const member = await taskRepository.findProjectMemberById(id);
    if (!member || member.projectId !== task.projectId) {
      throw new TaskServiceError('Membro do projeto não encontrado.', 404);
    }
    if (!member.isActive) {
      throw new TaskServiceError('Membro inativo não pode movimentar tarefas.', 400);
    }
    return { projectMemberId: member.id, movedBy: member.name };
  }
  return { movedBy: normalizeMovedBy(payload.movedBy) };
}

export function formatMovement(movement) {
  return {
    id: movement.id,
    taskId: movement.taskId,
    taskTitle: movement.task?.title || null,
    fromStatus: movement.fromStatus,
    toStatus: movement.toStatus,
    projectMemberId: movement.projectMemberId,
    movedBy: movement.movedBy,
    movedAt: movement.movedAt,
    ...(movement.sprintId ? { sprintId: movement.sprintId } : {})
  };
}
