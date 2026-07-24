import { taskRepository } from '../task.repository.js';
import { TaskServiceError, parseCommitId, parseTaskId } from '../task.schema.js';
import { ensureCommitExists, ensureTaskExists, formatCommit } from '../task.service-support.js';

export const taskCommitService = {
  async listTaskCommits(taskId) {
    const id = parseTaskId(taskId);
    await ensureTaskExists(id);
    return (await taskRepository.findTaskCommits(id)).map(formatCommit);
  },
  async linkCommit(taskId, data) {
    const id = parseTaskId(taskId);
    const task = await ensureTaskExists(id);
    const commitId = parseCommitId(data && typeof data === 'object' ? data.commitId : undefined);
    const commit = await ensureCommitExists(commitId);
    if (commit.projectId !== task.projectId) {
      throw new TaskServiceError(
        'O commit informado não pertence ao mesmo projeto da tarefa.',
        400
      );
    }
    if (await taskRepository.findTaskCommit(id, commitId)) {
      throw new TaskServiceError('Este commit já está vinculado à tarefa.', 409);
    }
    await taskRepository.createTaskCommit(id, commitId);
    return (await taskRepository.findTaskCommits(id)).map(formatCommit);
  },
  async unlinkCommit(taskId, commitId) {
    const id = parseTaskId(taskId);
    const parsedCommitId = parseCommitId(commitId);
    await ensureTaskExists(id);
    if (!(await taskRepository.findTaskCommit(id, parsedCommitId))) {
      throw new TaskServiceError('Vínculo entre tarefa e commit não encontrado.', 404);
    }
    await taskRepository.deleteTaskCommit(id, parsedCommitId);
    return (await taskRepository.findTaskCommits(id)).map(formatCommit);
  }
};
