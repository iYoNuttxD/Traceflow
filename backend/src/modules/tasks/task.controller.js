import { asyncHandler } from '../../shared/http/index.js';
import { taskService } from './task.service.js';
import { auditService } from '../audit/audit.service.js';

const taskFallback = 'Erro interno ao processar tarefa.';
const kanbanFallback = 'Erro interno ao processar Kanban.';

function recordTraceabilityMutation(req, task, action, resourceType, resourceId) {
  return auditService.recordOperational({
    actorUserId: req.auth.user.id,
    projectId: task.projectId,
    requestId: req.requestId,
    action,
    resourceType,
    resourceId
  });
}

export const taskController = {
  create: asyncHandler(async (req, res) => {
    const task = await taskService.createTask(req.params.projectId, req.body);
    await auditService.recordOperational({ actorUserId: req.auth.user.id, projectId: task.projectId, requestId: req.requestId, action: 'TASK_CREATED', resourceType: 'Task', resourceId: task.id });
    return res.status(201).json({ message: 'Tarefa cadastrada com sucesso.', task });
  }, { fallbackMessage: taskFallback }),

  findByProject: asyncHandler(async (req, res) => {
    const tasks = await taskService.findTasksByProject(req.params.projectId, req.query);
    return res.json({ total: tasks.length, tasks });
  }, { fallbackMessage: taskFallback }),

  findById: asyncHandler(async (req, res) => {
    const task = await taskService.getTaskById(req.params.id);
    return res.json({ task });
  }, { fallbackMessage: taskFallback }),

  update: asyncHandler(async (req, res) => {
    const task = await taskService.updateTask(req.params.id, req.body);
    await auditService.recordOperational({ actorUserId: req.auth.user.id, projectId: task.projectId, requestId: req.requestId, action: 'TASK_UPDATED', resourceType: 'Task', resourceId: task.id });
    return res.json({ message: 'Tarefa atualizada com sucesso.', task });
  }, { fallbackMessage: taskFallback }),

  updateStatus: asyncHandler(async (req, res) => {
    const task = await taskService.updateTaskStatus(req.params.id, req.body.status);
    return res.json({ message: 'Status da tarefa atualizado com sucesso.', task });
  }, { fallbackMessage: taskFallback }),

  linkPullRequest: asyncHandler(async (req, res) => {
    const task = await taskService.linkPullRequest(req.params.id, req.body);
    await recordTraceabilityMutation(req, task, 'TASK_PULL_REQUEST_LINKED', 'PullRequest', req.body.pullRequestId);
    return res.json({ message: 'Pull request vinculado à tarefa com sucesso.', task });
  }, { fallbackMessage: 'Erro interno ao vincular pull request à tarefa.' }),

  unlinkPullRequest: asyncHandler(async (req, res) => {
    const previous = await taskService.getTaskById(req.params.id);
    const task = await taskService.unlinkPullRequest(req.params.id);
    await recordTraceabilityMutation(req, task, 'TASK_PULL_REQUEST_UNLINKED', 'PullRequest', previous.pullRequest?.id);
    return res.json({ message: 'Pull request removido da tarefa.', task });
  }, { fallbackMessage: 'Erro interno ao remover pull request da tarefa.' }),

  linkRequirement: asyncHandler(async (req, res) => {
    const task = await taskService.linkRequirement(req.params.id, req.body);
    await recordTraceabilityMutation(req, task, 'REQUIREMENT_TASK_LINKED', 'Requirement', req.body.requirementId);
    return res.json({ message: 'Requisito vinculado à tarefa.', task });
  }, { fallbackMessage: 'Erro interno ao vincular requisito à tarefa.' }),

  unlinkRequirement: asyncHandler(async (req, res) => {
    const previous = await taskService.getTaskById(req.params.id);
    const task = await taskService.unlinkRequirement(req.params.id);
    await recordTraceabilityMutation(req, task, 'REQUIREMENT_TASK_UNLINKED', 'Requirement', previous.requirement?.id);
    return res.json({ message: 'Vínculo com requisito removido.', task });
  }, { fallbackMessage: 'Erro interno ao remover requisito da tarefa.' }),

  delete: asyncHandler(async (req, res) => {
    const task = await taskService.getTaskById(req.params.id);
    await taskService.deleteTask(req.params.id);
    await auditService.recordOperational({ actorUserId: req.auth.user.id, projectId: task.projectId, requestId: req.requestId, action: 'TASK_DELETED', resourceType: 'Task', resourceId: task.id });
    return res.json({ message: 'Tarefa excluída com sucesso.' });
  }, { fallbackMessage: 'Erro interno ao excluir tarefa.' }),

  listCommits: asyncHandler(async (req, res) => {
    const commits = await taskService.listTaskCommits(req.params.id);
    return res.json({ total: commits.length, commits });
  }, { fallbackMessage: 'Erro interno ao listar commits vinculados à tarefa.' }),

  linkCommit: asyncHandler(async (req, res) => {
    const task = await taskService.getTaskById(req.params.id);
    const commits = await taskService.linkCommit(req.params.id, req.body);
    await recordTraceabilityMutation(req, task, 'TASK_COMMIT_LINKED', 'Commit', req.body.commitId);
    return res.status(201).json({ message: 'Commit vinculado à tarefa com sucesso.', commits });
  }, { fallbackMessage: 'Erro interno ao vincular commit à tarefa.' }),

  unlinkCommit: asyncHandler(async (req, res) => {
    const task = await taskService.getTaskById(req.params.id);
    const commits = await taskService.unlinkCommit(req.params.id, req.params.commitId);
    await recordTraceabilityMutation(req, task, 'TASK_COMMIT_UNLINKED', 'Commit', req.params.commitId);
    return res.json({ message: 'Commit removido da tarefa.', commits });
  }, { fallbackMessage: 'Erro interno ao remover commit da tarefa.' }),

  listIssues: asyncHandler(async (req, res) => {
    const issues = await taskService.listTaskIssues(req.params.id);
    return res.json({ total: issues.length, issues });
  }, { fallbackMessage: 'Erro interno ao listar issues vinculadas à tarefa.' }),

  linkIssue: asyncHandler(async (req, res) => {
    const task = await taskService.getTaskById(req.params.id);
    const issues = await taskService.linkIssue(req.params.id, req.body);
    await recordTraceabilityMutation(req, task, 'TASK_ISSUE_LINKED', 'Issue', req.body.issueId);
    return res.status(201).json({ message: 'Issue vinculada à tarefa com sucesso.', issues });
  }, { fallbackMessage: 'Erro interno ao vincular issue à tarefa.' }),

  unlinkIssue: asyncHandler(async (req, res) => {
    const task = await taskService.getTaskById(req.params.id);
    const issues = await taskService.unlinkIssue(req.params.id, req.params.issueId);
    await recordTraceabilityMutation(req, task, 'TASK_ISSUE_UNLINKED', 'Issue', req.params.issueId);
    return res.json({ message: 'Issue removida da tarefa.', issues });
  }, { fallbackMessage: 'Erro interno ao remover issue da tarefa.' }),

  getKanbanBoard: asyncHandler(async (req, res) => {
    return res.json(await taskService.getKanbanBoard(req.params.projectId));
  }, { fallbackMessage: kanbanFallback }),

  moveTask: asyncHandler(async (req, res) => {
    const result = await taskService.moveTask(req.params.id, req.body, req.auth.user);
    await auditService.recordOperational({ actorUserId: req.auth.user.id, projectId: result.task.projectId, requestId: req.requestId, action: 'TASK_MOVED', resourceType: 'Task', resourceId: result.task.id });
    return res.json({
      message: 'Tarefa movida com sucesso.',
      task: result.task,
      movement: result.movement
    });
  }, { fallbackMessage: kanbanFallback }),

  listMovements: asyncHandler(async (req, res) => {
    return res.json(await taskService.listMovements(req.params.projectId, req.query));
  }, { fallbackMessage: kanbanFallback }),

  getKanbanMetrics: asyncHandler(async (req, res) => {
    return res.json(await taskService.getKanbanMetrics(req.params.projectId, req.query));
  }, { fallbackMessage: kanbanFallback }),

  getMetrics: asyncHandler(async (req, res) => {
    const metrics = await taskService.getTaskMetrics(
      req.params.projectId,
      req.query.startDate,
      req.query.endDate
    );
    return res.json(metrics);
  }, { fallbackMessage: taskFallback })
};
