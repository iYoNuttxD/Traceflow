import { createGithubSyncScheduler } from './modules/github/services/github-sync-scheduler.service.js';
import { enforceConnectionBudget } from './database/connection-budget.js';
import { disconnectDatabase } from './database/prismaClient.js';
import { createJobRunner } from './jobs/job-runner.js';
import { logger } from './shared/logger/index.js';
import { createWorkerRuntime } from './shared/runtime/worker-runtime.js';

enforceConnectionBudget('worker');

const runtime = createWorkerRuntime({
  services: [createGithubSyncScheduler(), createJobRunner()],
  disconnect: disconnectDatabase,
  logger
});
if (!runtime.start()) await disconnectDatabase();
process.once('SIGINT', () => void runtime.stop('SIGINT'));
process.once('SIGTERM', () => void runtime.stop('SIGTERM'));
