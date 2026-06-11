// Rotas do modulo de tarefas. Regras de negocio ficam no service.
import { Router } from 'express';
import { taskController } from './task.controller.js';

const router = Router();

router.post('/projects/:projectId/tasks', taskController.create);
router.get('/projects/:projectId/tasks', taskController.findByProject);
router.get('/projects/:projectId/tasks/metrics', taskController.getMetrics);
router.get(
  '/projects/:projectId/traceability/pull-request-coverage',
  taskController.getPullRequestCoverage
);
router.get(
  '/projects/:projectId/traceability/commit-coverage',
  taskController.getCommitCoverage
);
router.get(
  '/projects/:projectId/traceability/issue-coverage',
  taskController.getIssueCoverage
);
router.get('/projects/:projectId/kanban', taskController.getKanbanBoard);
router.get('/projects/:projectId/kanban/movements', taskController.listMovements);
router.get('/projects/:projectId/kanban/metrics', taskController.getKanbanMetrics);
router.get('/tasks/:id', taskController.findById);
router.put('/tasks/:id', taskController.update);
router.patch('/tasks/:id/status', taskController.updateStatus);
router.patch('/tasks/:id/requirement', taskController.linkRequirement);
router.delete('/tasks/:id/requirement', taskController.unlinkRequirement);
router.patch('/tasks/:id/pull-request', taskController.linkPullRequest);
router.delete('/tasks/:id/pull-request', taskController.unlinkPullRequest);
router.get('/tasks/:id/commits', taskController.listCommits);
router.post('/tasks/:id/commits', taskController.linkCommit);
router.delete('/tasks/:id/commits/:commitId', taskController.unlinkCommit);
router.get('/tasks/:id/issues', taskController.listIssues);
router.post('/tasks/:id/issues', taskController.linkIssue);
router.delete('/tasks/:id/issues/:issueId', taskController.unlinkIssue);
router.patch('/tasks/:id/move', taskController.moveTask);

export default router;
