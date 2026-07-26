import { taskRepository } from '../task.repository.js';
import { TaskServiceError, parseIssueId, parseTaskId } from '../task.schema.js';
import { ensureIssueExists, ensureTaskExists, formatIssue } from '../task.service-support.js';
import { taskLinkRepository } from '../repositories/task-link.repository.js';
import { buildAuditEvent } from '../../audit/audit.service.js';

export const taskIssueService = {
  async listTaskIssues(taskId) {
    const id = parseTaskId(taskId);
    await ensureTaskExists(id);
    return (await taskRepository.findTaskIssues(id)).map(formatIssue);
  },
  async linkIssue(taskId, data, context = {}) {
    const id = parseTaskId(taskId);
    const task = await ensureTaskExists(id);
    const issueId = parseIssueId(data && typeof data === 'object' ? data.issueId : undefined);
    const issue = await ensureIssueExists(issueId);
    if (issue.projectId !== task.projectId) {
      throw new TaskServiceError('A issue informada não pertence ao mesmo projeto da tarefa.', 400);
    }
    if (await taskRepository.findTaskIssue(id, issueId)) {
      throw new TaskServiceError('Esta issue já está vinculada à tarefa.', 409);
    }
    await taskLinkRepository.createIssue(
      id,
      issueId,
      buildAuditEvent({
        actorUserId: context.actorUserId,
        projectId: task.projectId,
        requestId: context.requestId,
        action: 'TASK_ISSUE_LINKED',
        resourceType: 'Issue',
        resourceId: issueId,
        metadata: { taskId: id }
      })
    );
    return (await taskRepository.findTaskIssues(id)).map(formatIssue);
  },
  async unlinkIssue(taskId, issueId, context = {}) {
    const id = parseTaskId(taskId);
    const parsedIssueId = parseIssueId(issueId);
    const task = await ensureTaskExists(id);
    if (!(await taskRepository.findTaskIssue(id, parsedIssueId))) {
      throw new TaskServiceError('Vínculo entre tarefa e issue não encontrado.', 404);
    }
    await taskLinkRepository.deleteIssue(
      id,
      parsedIssueId,
      buildAuditEvent({
        actorUserId: context.actorUserId,
        projectId: task.projectId,
        requestId: context.requestId,
        action: 'TASK_ISSUE_UNLINKED',
        resourceType: 'Issue',
        resourceId: parsedIssueId,
        metadata: { taskId: id }
      })
    );
    return (await taskRepository.findTaskIssues(id)).map(formatIssue);
  }
};
