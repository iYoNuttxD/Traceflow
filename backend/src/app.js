import cors from 'cors';
import express from 'express';
import { createErrorHandler } from './middlewares/error-handler.middleware.js';
import { notFoundMiddleware } from './middlewares/not-found.middleware.js';
import { createRequestContextMiddleware } from './middlewares/request-context.middleware.js';
import routes from './routes/index.js';
import { createHealthHandlers } from './shared/http/index.js';
import { logger as defaultLogger } from './shared/logger/index.js';

export function createApp({ logger = defaultLogger, readinessCheck } = {}) {
  const app = express();
  const health = createHealthHandlers({ readinessCheck });

  app.use(createRequestContextMiddleware({ logger }));
  app.use(cors());
  app.use(express.json());

  app.get('/health', health.health);
  app.get('/health/live', health.live);
  app.get('/health/ready', health.ready);
  app.use('/api', routes);
  app.use(notFoundMiddleware);
  app.use(createErrorHandler({ logger }));

  return app;
}

const app = createApp();

export default app;
