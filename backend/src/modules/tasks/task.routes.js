// Rotas do modulo de tarefas. Regras de negocio ficam no service.
import { Router } from 'express';
import { emptyBodySchema, validateRequest } from '../../shared/validation/index.js';
import { taskController } from './task.controller.js';
import {
  createTaskBodySchema,
  moveTaskBodySchema,
  movementQuerySchema,
  taskCommitBodySchema,
  taskCommitParamsSchema,
  taskDateRangeQuerySchema,
  taskIdParamsSchema,
  taskIssueBodySchema,
  taskIssueParamsSchema,
  taskProjectParamsSchema,
  taskPullRequestBodySchema,
  taskRequirementBodySchema,
  taskSearchQuerySchema,
  taskStatusBodySchema,
  updateTaskBodySchema
} from './task.validation.js';

const router = Router();

router.post('/projects/:projectId/tasks', validateRequest({ params: taskProjectParamsSchema, body: createTaskBodySchema }), taskController.create);
router.get('/projects/:projectId/tasks', validateRequest({ params: taskProjectParamsSchema, query: taskSearchQuerySchema }), taskController.findByProject);
router.get('/projects/:projectId/tasks/metrics', validateRequest({ params: taskProjectParamsSchema, query: taskDateRangeQuerySchema }), taskController.getMetrics);
router.get(
  '/projects/:projectId/traceability/pull-request-coverage',
  validateRequest({ params: taskProjectParamsSchema }),
  taskController.getPullRequestCoverage
);
router.get(
  '/projects/:projectId/traceability/commit-coverage',
  validateRequest({ params: taskProjectParamsSchema }),
  taskController.getCommitCoverage
);
router.get(
  '/projects/:projectId/traceability/issue-coverage',
  validateRequest({ params: taskProjectParamsSchema }),
  taskController.getIssueCoverage
);
router.get('/projects/:projectId/kanban', validateRequest({ params: taskProjectParamsSchema }), taskController.getKanbanBoard);
router.get('/projects/:projectId/kanban/movements', validateRequest({ params: taskProjectParamsSchema, query: movementQuerySchema }), taskController.listMovements);
router.get('/projects/:projectId/kanban/metrics', validateRequest({ params: taskProjectParamsSchema, query: movementQuerySchema }), taskController.getKanbanMetrics);
router.get('/tasks/:id', validateRequest({ params: taskIdParamsSchema }), taskController.findById);
router.put('/tasks/:id', validateRequest({ params: taskIdParamsSchema, body: updateTaskBodySchema }), taskController.update);
router.delete('/tasks/:id', validateRequest({ params: taskIdParamsSchema, body: emptyBodySchema }), taskController.delete);
router.patch('/tasks/:id/status', validateRequest({ params: taskIdParamsSchema, body: taskStatusBodySchema }), taskController.updateStatus);
router.patch('/tasks/:id/requirement', validateRequest({ params: taskIdParamsSchema, body: taskRequirementBodySchema }), taskController.linkRequirement);
router.delete('/tasks/:id/requirement', validateRequest({ params: taskIdParamsSchema, body: emptyBodySchema }), taskController.unlinkRequirement);
router.patch('/tasks/:id/pull-request', validateRequest({ params: taskIdParamsSchema, body: taskPullRequestBodySchema }), taskController.linkPullRequest);
router.delete('/tasks/:id/pull-request', validateRequest({ params: taskIdParamsSchema, body: emptyBodySchema }), taskController.unlinkPullRequest);
router.get('/tasks/:id/commits', validateRequest({ params: taskIdParamsSchema }), taskController.listCommits);
router.post('/tasks/:id/commits', validateRequest({ params: taskIdParamsSchema, body: taskCommitBodySchema }), taskController.linkCommit);
router.delete('/tasks/:id/commits/:commitId', validateRequest({ params: taskCommitParamsSchema, body: emptyBodySchema }), taskController.unlinkCommit);
router.get('/tasks/:id/issues', validateRequest({ params: taskIdParamsSchema }), taskController.listIssues);
router.post('/tasks/:id/issues', validateRequest({ params: taskIdParamsSchema, body: taskIssueBodySchema }), taskController.linkIssue);
router.delete('/tasks/:id/issues/:issueId', validateRequest({ params: taskIssueParamsSchema, body: emptyBodySchema }), taskController.unlinkIssue);
router.patch('/tasks/:id/move', validateRequest({ params: taskIdParamsSchema, body: moveTaskBodySchema }), taskController.moveTask);

export default router;
