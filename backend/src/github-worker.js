import { createGithubSyncScheduler } from './modules/github/services/github-sync-scheduler.service.js';
import { disconnectDatabase } from './database/prismaClient.js';
import { logger } from './shared/logger/index.js';
import { createWorkerRuntime } from './shared/runtime/worker-runtime.js';

const runtime = createWorkerRuntime({
  services: [createGithubSyncScheduler()],
  disconnect: disconnectDatabase,
  logger
});
if (!runtime.start()) await disconnectDatabase();
process.once('SIGINT', () => void runtime.stop('SIGINT'));
process.once('SIGTERM', () => void runtime.stop('SIGTERM'));
