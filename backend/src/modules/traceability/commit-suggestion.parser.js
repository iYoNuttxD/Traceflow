const TASK_REFERENCE_PATTERN = /\[TASK-(\d+)\]/gi;

export function extractTaskIdsFromCommitMessage(message) {
  if (typeof message !== 'string' || message.length === 0) return [];

  const taskIds = new Set();
  for (const match of message.matchAll(TASK_REFERENCE_PATTERN)) {
    const taskId = Number(match[1]);
    if (Number.isSafeInteger(taskId) && taskId > 0) taskIds.add(taskId);
  }
  return [...taskIds];
}
