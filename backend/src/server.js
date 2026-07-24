import app from './app.js';
import { env } from './config/env.js';
import { prisma } from './database/prismaClient.js';
import { logger } from './shared/logger/index.js';
import { createGracefulShutdown } from './shared/runtime/graceful-shutdown.js';

const server = app.listen(env.port, () => {
  logger.info('TRACEFLOW backend running.', { port: env.port });
});

const shutdown = createGracefulShutdown({
  server,
  disconnect: () => prisma.$disconnect(),
  logger
});

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
