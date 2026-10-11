import { createGithubSyncScheduler } from './modules/github/services/github-sync-scheduler.service.js';
import { prisma } from './database/prismaClient.js';
import { logger } from './shared/logger/index.js';

const worker = createGithubSyncScheduler();
if (!worker.start()) {
  logger.info('Worker GitHub desabilitado.', { event: 'github_scheduler_disabled' });
  await prisma.$disconnect();
}
let stopping;
function stop() {
  stopping ||= worker.stop().finally(() => prisma.$disconnect());
  return stopping;
}
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
