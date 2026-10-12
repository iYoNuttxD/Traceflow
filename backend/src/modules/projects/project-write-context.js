import { AsyncLocalStorage } from 'node:async_hooks';

const writeContext = new AsyncLocalStorage();

// An async job can attach a fence to every canonical Project transaction,
// including nested artifact/suggestion writes, without holding locks over HTTP.
export function withProjectWriteGuard(projectId, assertCanWrite, work, { nowait = false } = {}) {
  return writeContext.run({ projectId, assertCanWrite, nowait }, work);
}

export function projectWriteUsesNowait(projectId) {
  const context = writeContext.getStore();
  return context?.projectId === projectId && context.nowait;
}

export async function assertProjectWriteGuard(tx, projectId) {
  const context = writeContext.getStore();
  if (context) {
    if (context.projectId !== projectId) throw new Error('Project write context mismatch.');
    await context.assertCanWrite(tx);
  }
}
