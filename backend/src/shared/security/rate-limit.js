import { createHash } from 'node:crypto';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { AppError, ERROR_CODES } from '../errors/index.js';

const rateLimitMessage = 'Muitas requisições. Tente novamente mais tarde.';

function safeClientKey(req) {
  return ipKeyGenerator(req.ip || req.socket?.remoteAddress || 'unknown');
}

function limiter({ identifier, windowMs, limit, keyGenerator = safeClientKey }) {
  return rateLimit({
    windowMs,
    limit,
    identifier,
    keyGenerator,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS',
    handler(req, res, next) {
      return next(new AppError({
        message: rateLimitMessage,
        statusCode: 429,
        code: ERROR_CODES.RATE_LIMITED,
        exposeTechnicalDetails: true
      }));
    }
  });
}

export function createRateLimiters({ windowMs, generalMax, sensitiveMax }) {
  const syncMax = Math.max(1, Math.min(5, sensitiveMax));
  return Object.freeze({
    general: limiter({ identifier: 'api-general', windowMs, limit: generalMax }),
    sensitive: limiter({ identifier: 'api-sensitive', windowMs, limit: sensitiveMax }),
    join: limiter({ identifier: 'project-join', windowMs, limit: Math.max(1, Math.min(10, sensitiveMax)) }),
    sync: limiter({
      identifier: 'github-sync',
      windowMs,
      limit: syncMax,
      keyGenerator: (req) => `${safeClientKey(req)}:project:${req.params.projectId || 'unknown'}`
    })
  });
}

function anonymizeClient(req) {
  return createHash('sha256').update(safeClientKey(req)).digest('hex').slice(0, 12);
}

export function createSensitiveAttemptLogger({ logger, event }) {
  return function sensitiveAttemptLogger(req, res, next) {
    logger.info('Sensitive API operation attempted.', {
      requestId: req.requestId,
      securityEvent: event,
      clientKey: anonymizeClient(req),
      method: req.method,
      path: req.path
    });
    next();
  };
}
