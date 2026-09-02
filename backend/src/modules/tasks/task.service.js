import { taskCommentService } from './services/task-comment.service.js';
import { taskCommitService } from './services/task-commit.service.js';
import { taskCrudService } from './services/task-crud.service.js';
import { taskIssueService } from './services/task-issue.service.js';
import { taskHistoryService } from './services/task-history.service.js';
import { taskKanbanService } from './services/task-kanban.service.js';
import { taskMetricsService } from './services/task-metrics.service.js';
import { taskMovementService } from './services/task-movement.service.js';
import { pullRequestLinkService } from './services/task-pull-request.service.js';
import { taskRequirementService } from './services/task-requirement.service.js';

// API pública interna do módulo: agrega os casos de uso consumidos pelo controller.
export const taskService = {
  ...taskCrudService,
  ...taskCommentService,
  ...taskRequirementService,
  ...pullRequestLinkService,
  ...taskCommitService,
  ...taskIssueService,
  ...taskHistoryService,
  ...taskKanbanService,
  ...taskMovementService,
  ...taskMetricsService
};
