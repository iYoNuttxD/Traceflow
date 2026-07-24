import { taskRepository } from '../task.repository.js';
import { TaskServiceError, parsePullRequestId, parseTaskId } from '../task.schema.js';
import {
  ensurePullRequestExists,
  ensureTaskExists,
  formatTask
} from '../task.service-support.js';

export const taskPullRequestService = {
  async linkPullRequest(taskId, data) {
    const id = parseTaskId(taskId);
    const task = await ensureTaskExists(id);
    const payload = data && typeof data === 'object' ? data : {};
    if (payload.pullRequestId === null || payload.pullRequestId === '') {
      return formatTask(await taskRepository.updateTaskPullRequest(id, null));
    }
    const pullRequestId = parsePullRequestId(payload.pullRequestId);
    const pullRequest = await ensurePullRequestExists(pullRequestId);
    if (pullRequest.projectId !== task.projectId) {
      throw new TaskServiceError(
        'O pull request informado não pertence ao mesmo projeto da tarefa.',
        400
      );
    }
    return formatTask(await taskRepository.updateTaskPullRequest(id, pullRequestId));
  },

  async unlinkPullRequest(taskId) {
    const id = parseTaskId(taskId);
    await ensureTaskExists(id);
    return formatTask(await taskRepository.updateTaskPullRequest(id, null));
  }
};
