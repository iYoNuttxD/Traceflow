import app from './app.js';
import { env } from './config/env.js';
import { prisma } from './database/prismaClient.js';
import { logger } from './shared/logger/index.js';
import { createGracefulShutdown } from './shared/runtime/graceful-shutdown.js';
import { projectEventPublisher } from './shared/events/index.js';

const server = app.listen(env.port, () => {
  logger.info('TRACEFLOW backend running.', { port: env.port });
});

const shutdown = createGracefulShutdown({
  server,
  disconnect: () => prisma.$disconnect(),
  logger
});

function shutdownWithStreams(signal) {
  projectEventPublisher.closeAll('shutdown');
  return shutdown(signal);
}

process.once('SIGINT', () => void shutdownWithStreams('SIGINT'));
process.once('SIGTERM', () => void shutdownWithStreams('SIGTERM'));
