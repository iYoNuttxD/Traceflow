import { randomUUID } from 'node:crypto';
import { logger as defaultLogger } from '../shared/logger/index.js';

const requestIdPattern = /^[A-Za-z0-9._:-]{1,64}$/;

export function resolveRequestId(value) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === 'string' && requestIdPattern.test(candidate)
    ? candidate
    : randomUUID();
}

export function createRequestContextMiddleware({ logger = defaultLogger, now = Date.now } = {}) {
  return function requestContext(req, res, next) {
    const requestId = resolveRequestId(req.get('x-request-id'));
    const startedAt = now();
    req.context = Object.freeze({ requestId, startedAt });
    req.requestId = requestId;
    res.set('X-Request-Id', requestId);

    res.once('finish', () => {
      logger.info('HTTP request completed.', {
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Math.max(0, now() - startedAt)
      });
    });

    next();
  };
}

export const requestContextMiddleware = createRequestContextMiddleware();
