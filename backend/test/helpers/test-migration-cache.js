import { createHash } from 'node:crypto';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// The directory is owned by globalSetup for one sequential Vitest invocation.
// Do not reuse it across processes/runs or use this helper as a concurrency lock.
export function deployOncePerInvocation({ directory, databaseUrl, deploy, force = false }) {
  if (!directory) return deploy();
  // Never put credentials in filenames or marker contents.
  const key = createHash('sha256').update(databaseUrl).digest('hex');
  const marker = join(directory, key);
  if (!force && existsSync(marker)) return;
  rmSync(marker, { force: true });
  const result = deploy();
  // Failed deployments must remain retryable, including a failed forced refresh.
  writeFileSync(marker, '', { flag: 'wx', mode: 0o600 });
  return result;
}
