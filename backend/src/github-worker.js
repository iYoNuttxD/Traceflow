import { env, assertWorkerEnvironment } from './config/env.js';
import { createGithubSyncScheduler } from './modules/github/services/github-sync-scheduler.service.js';
import { prisma } from './database/prismaClient.js';
import { logger } from './shared/logger/index.js';

assertWorkerEnvironment(env);

const worker = createGithubSyncScheduler();
if (!worker.start()) await prisma.$disconnect();
let stopping;
function stop() {
  stopping ||= worker
    .stop()
    .finally(() => prisma.$disconnect())
    .catch((error) => {
      logger.error('Falha ao encerrar worker GitHub.', {
        event: 'github_scheduler_shutdown_failed',
        errorCode: error.code || 'WORKER_FAILED'
      });
      process.exitCode = 1;
    });
  return stopping;
}
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
