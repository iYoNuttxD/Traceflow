import { TaskServiceError, parsePullRequestId, parseTaskId } from '../task.schema.js';
import { ensurePullRequestExists, ensureTaskExists, formatTask } from '../task.service-support.js';
import { taskLinkRepository } from '../repositories/task-link.repository.js';
import { buildAuditEvent } from '../../audit/audit.service.js';

export const pullRequestLinkService = {
  async linkPullRequest(taskId, data, context = {}) {
    const id = parseTaskId(taskId);
    const task = await ensureTaskExists(id);
    const payload = data && typeof data === 'object' ? data : {};
    if (payload.pullRequestId === null || payload.pullRequestId === '') {
      if (!task.pullRequestId) return formatTask(task);
      return formatTask(
        await taskLinkRepository.setPullRequest(
          id,
          null,
          buildAuditEvent({
            actorUserId: context.actorUserId,
            projectId: task.projectId,
            requestId: context.requestId,
            action: 'TASK_PULL_REQUEST_UNLINKED',
            resourceType: 'PullRequest',
            resourceId: task.pullRequestId,
            metadata: { taskId: id }
          })
        )
      );
    }
    const pullRequestId = parsePullRequestId(payload.pullRequestId);
    const pullRequest = await ensurePullRequestExists(pullRequestId);
    if (pullRequest.projectId !== task.projectId) {
      throw new TaskServiceError(
        'O pull request informado não pertence ao mesmo projeto da tarefa.',
        400
      );
    }
    if (task.pullRequestId === pullRequestId) return formatTask(task);
    return formatTask(
      await taskLinkRepository.setPullRequest(
        id,
        pullRequestId,
        buildAuditEvent({
          actorUserId: context.actorUserId,
          projectId: task.projectId,
          requestId: context.requestId,
          action: 'TASK_PULL_REQUEST_LINKED',
          resourceType: 'PullRequest',
          resourceId: pullRequestId,
          metadata: { taskId: id }
        })
      )
    );
  },

  async unlinkPullRequest(taskId, context = {}) {
    const id = parseTaskId(taskId);
    const task = await ensureTaskExists(id);
    if (!task.pullRequestId) return formatTask(task);
    return formatTask(
      await taskLinkRepository.setPullRequest(
        id,
        null,
        buildAuditEvent({
          actorUserId: context.actorUserId,
          projectId: task.projectId,
          requestId: context.requestId,
          action: 'TASK_PULL_REQUEST_UNLINKED',
          resourceType: 'PullRequest',
          resourceId: task.pullRequestId,
          metadata: { taskId: id }
        })
      )
    );
  }
};
