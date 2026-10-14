import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './database/prismaClient.js';
import { logger } from './shared/logger/index.js';
import { createGracefulShutdown } from './shared/runtime/graceful-shutdown.js';
import { createLifecycle } from './shared/runtime/lifecycle.js';
import { projectEventPublisher } from './shared/events/index.js';
import { waitForManualGithubSyncRuns } from './modules/github/services/github-sync-run.service.js';
import { testEvidenceStorage } from './modules/testCases/index.js';

const lifecycle = createLifecycle();
const app = createApp({ lifecycle });

// Production storage is provisioned by operations; startup never creates it.
if (env.isProduction) await testEvidenceStorage.checkReadiness();
const server = app.listen(env.port, env.httpHost, () => {
  lifecycle.ready();
  logger.info('TRACEFLOW backend running.', { port: env.port, host: server.address().address });
  if (env.githubSchedulerEnabled)
    logger.info('O scheduler GitHub é executado em um processo worker independente.', {
      event: 'github_worker_startup_required',
      schedulerEnabled: env.githubSchedulerEnabled
    });
});
// These bound request reception, not application work or the lifetime of SSE.
server.headersTimeout = 15000;
server.requestTimeout = 60000;
server.keepAliveTimeout = 5000;
const shutdown = createGracefulShutdown({
  server,
  beginDrain: () => lifecycle.drain(),
  closeStreams: () => projectEventPublisher.closeAll('shutdown'),
  waitForBackground: waitForManualGithubSyncRuns,
  timeoutMs: env.shutdownTimeoutMs,
  disconnect: () => prisma.$disconnect(),
  logger
});
// Keep handlers installed: repeated signals must not bypass the shared shutdown promise.
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
