import { asyncHandler } from '../../shared/http/index.js';
import { taskService } from './task.service.js';

const taskFallback = 'Erro interno ao processar tarefa.';
const kanbanFallback = 'Erro interno ao processar Kanban.';

const context = (req) => ({
  actor: req.auth.user,
  actorUserId: req.auth.user.id,
  membershipRole: req.projectMembership?.role,
  requestId: req.requestId
});

export const taskController = {
  create: asyncHandler(
    async (req, res) => {
      const task = await taskService.createTask(req.params.projectId, req.body, context(req));
      return res.status(201).json({ message: 'Tarefa cadastrada com sucesso.', task });
    },
    { fallbackMessage: taskFallback }
  ),

  findByProject: asyncHandler(
    async (req, res) => {
      const tasks = await taskService.findTasksByProject(req.params.projectId, req.query);
      return res.json({ total: tasks.length, tasks });
    },
    { fallbackMessage: taskFallback }
  ),

  findById: asyncHandler(
    async (req, res) => {
      const task = await taskService.getTaskById(req.params.id);
      return res.json({ task });
    },
    { fallbackMessage: taskFallback }
  ),

  update: asyncHandler(
    async (req, res) => {
      const task = await taskService.updateTask(req.params.id, req.body, context(req));
      return res.json({ message: 'Tarefa atualizada com sucesso.', task });
    },
    { fallbackMessage: taskFallback }
  ),

  updateStatus: asyncHandler(
    async (req, res) => {
      const task = await taskService.updateTaskStatus(req.params.id, req.body.status, context(req));
      return res.json({ message: 'Status da tarefa atualizado com sucesso.', task });
    },
    { fallbackMessage: taskFallback }
  ),

  linkPullRequest: asyncHandler(
    async (req, res) => {
      const task = await taskService.linkPullRequest(req.params.id, req.body, context(req));
      return res.json({ message: 'Pull request vinculado à tarefa com sucesso.', task });
    },
    { fallbackMessage: 'Erro interno ao vincular pull request à tarefa.' }
  ),

  unlinkPullRequest: asyncHandler(
    async (req, res) => {
      const task = await taskService.unlinkPullRequest(req.params.id, context(req));
      return res.json({ message: 'Pull request removido da tarefa.', task });
    },
    { fallbackMessage: 'Erro interno ao remover pull request da tarefa.' }
  ),

  linkRequirement: asyncHandler(
    async (req, res) => {
      const task = await taskService.linkRequirement(req.params.id, req.body, context(req));
      return res.json({ message: 'Requisito vinculado à tarefa.', task });
    },
    { fallbackMessage: 'Erro interno ao vincular requisito à tarefa.' }
  ),

  unlinkRequirement: asyncHandler(
    async (req, res) => {
      const task = await taskService.unlinkRequirement(req.params.id, context(req));
      return res.json({ message: 'Vínculo com requisito removido.', task });
    },
    { fallbackMessage: 'Erro interno ao remover requisito da tarefa.' }
  ),

  delete: asyncHandler(
    async (req, res) => {
      await taskService.deleteTask(req.params.id, context(req));
      return res.json({ message: 'Tarefa excluída com sucesso.' });
    },
    { fallbackMessage: 'Erro interno ao excluir tarefa.' }
  ),

  listCommits: asyncHandler(
    async (req, res) => {
      const commits = await taskService.listTaskCommits(req.params.id);
      return res.json({ total: commits.length, commits });
    },
    { fallbackMessage: 'Erro interno ao listar commits vinculados à tarefa.' }
  ),

  linkCommit: asyncHandler(
    async (req, res) => {
      const commits = await taskService.linkCommit(req.params.id, req.body, context(req));
      return res.status(201).json({ message: 'Commit vinculado à tarefa com sucesso.', commits });
    },
    { fallbackMessage: 'Erro interno ao vincular commit à tarefa.' }
  ),

  unlinkCommit: asyncHandler(
    async (req, res) => {
      const commits = await taskService.unlinkCommit(
        req.params.id,
        req.params.commitId,
        context(req)
      );
      return res.json({ message: 'Commit removido da tarefa.', commits });
    },
    { fallbackMessage: 'Erro interno ao remover commit da tarefa.' }
  ),

  listIssues: asyncHandler(
    async (req, res) => {
      const issues = await taskService.listTaskIssues(req.params.id);
      return res.json({ total: issues.length, issues });
    },
    { fallbackMessage: 'Erro interno ao listar issues vinculadas à tarefa.' }
  ),

  linkIssue: asyncHandler(
    async (req, res) => {
      const issues = await taskService.linkIssue(req.params.id, req.body, context(req));
      return res.status(201).json({ message: 'Issue vinculada à tarefa com sucesso.', issues });
    },
    { fallbackMessage: 'Erro interno ao vincular issue à tarefa.' }
  ),

  unlinkIssue: asyncHandler(
    async (req, res) => {
      const issues = await taskService.unlinkIssue(req.params.id, req.params.issueId, context(req));
      return res.json({ message: 'Issue removida da tarefa.', issues });
    },
    { fallbackMessage: 'Erro interno ao remover issue da tarefa.' }
  ),

  listComments: asyncHandler(
    async (req, res) => {
      return res.json(await taskService.listTaskComments(req.params.id, req.query, context(req)));
    },
    { fallbackMessage: 'Erro interno ao listar comentários da tarefa.' }
  ),

  createComment: asyncHandler(
    async (req, res) => {
      const comment = await taskService.createTaskComment(req.params.id, req.body, context(req));
      return res.status(201).json({ message: 'Comentário registrado com sucesso.', comment });
    },
    { fallbackMessage: 'Erro interno ao registrar comentário na tarefa.' }
  ),

  updateComment: asyncHandler(
    async (req, res) => {
      const comment = await taskService.updateTaskComment(
        req.params.id,
        req.params.commentId,
        req.body,
        context(req)
      );
      return res.json({ message: 'Comentário atualizado com sucesso.', comment });
    },
    { fallbackMessage: 'Erro interno ao atualizar comentário da tarefa.' }
  ),

  deleteComment: asyncHandler(
    async (req, res) => {
      await taskService.deleteTaskComment(req.params.id, req.params.commentId, context(req));
      return res.json({ message: 'Comentário excluído com sucesso.' });
    },
    { fallbackMessage: 'Erro interno ao excluir comentário da tarefa.' }
  ),

  getKanbanBoard: asyncHandler(
    async (req, res) => {
      return res.json(await taskService.getKanbanBoard(req.params.projectId));
    },
    { fallbackMessage: kanbanFallback }
  ),

  moveTask: asyncHandler(
    async (req, res) => {
      const result = await taskService.moveTask(req.params.id, req.body, context(req));
      return res.json({
        message: 'Tarefa movida com sucesso.',
        task: result.task,
        movement: result.movement
      });
    },
    { fallbackMessage: kanbanFallback }
  ),

  listMovements: asyncHandler(
    async (req, res) => {
      return res.json(await taskService.listMovements(req.params.projectId, req.query));
    },
    { fallbackMessage: kanbanFallback }
  ),

  listHistory: asyncHandler(
    async (req, res) => {
      return res.json(await taskService.listTaskHistory(req.params.projectId, req.query));
    },
    { fallbackMessage: 'Erro interno ao listar histórico de tarefas.' }
  ),

  getKanbanMetrics: asyncHandler(
    async (req, res) => {
      return res.json(await taskService.getKanbanMetrics(req.params.projectId, req.query));
    },
    { fallbackMessage: kanbanFallback }
  ),

  getMetrics: asyncHandler(
    async (req, res) => {
      const metrics = await taskService.getTaskMetrics(
        req.params.projectId,
        req.query.startDate,
        req.query.endDate
      );
      return res.json(metrics);
    },
    { fallbackMessage: taskFallback }
  )
};
