import { createHash } from 'node:crypto';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { ERROR_CODES } from '../errors/index.js';

const rateLimitMessage = 'Muitas requisições. Tente novamente mais tarde.';

function safeClientKey(req) {
  return ipKeyGenerator(req.ip || req.socket?.remoteAddress || 'unknown');
}

function hashIdentifier(value) {
  return createHash('sha256')
    .update(
      String(value || '')
        .trim()
        .toLowerCase()
    )
    .digest('hex')
    .slice(0, 24);
}

function authenticatedKey(req) {
  return req.auth?.user?.id ? `user:${req.auth.user.id}` : `ip:${safeClientKey(req)}`;
}

function authenticationKey(req) {
  const identifier =
    req.body?.identifier || req.body?.email || req.body?.username || req.body?.token || 'anonymous';
  return `ip:${safeClientKey(req)}:identifier:${hashIdentifier(identifier)}`;
}

function emailDeliveryKey(req) {
  const destination = req.body?.newEmail || req.body?.email || 'account-email';
  return `${authenticatedKey(req)}:destination:${hashIdentifier(destination)}`;
}

function retryAfterSeconds(req, windowMs) {
  const resetTime = req.rateLimit?.resetTime;
  if (resetTime instanceof Date) {
    return Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000));
  }
  return Math.max(1, Math.ceil(windowMs / 1000));
}

function limiter({ scope, windowMs, limit, keyGenerator = safeClientKey, logger }) {
  return rateLimit({
    windowMs,
    limit,
    identifier: scope,
    keyGenerator,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS',
    handler(req, res) {
      const retryAfter = retryAfterSeconds(req, windowMs);
      res.setHeader('Retry-After', String(retryAfter));
      logger?.warn('Rate limit quota exceeded.', {
        event: 'rate_limit_exceeded',
        scope,
        method: req.method,
        route: req.route?.path || req.path,
        authenticated: Boolean(req.auth?.user?.id),
        requestId: req.requestId
      });
      return res.status(429).json({
        code: ERROR_CODES.RATE_LIMITED,
        message: rateLimitMessage,
        retryAfterSeconds: retryAfter,
        scope,
        ...(req.requestId ? { requestId: req.requestId } : {})
      });
    }
  });
}

function value(config, key, fallback) {
  return Number.isInteger(config[key]) ? config[key] : fallback;
}

export function createRateLimiters(config = {}) {
  const legacyWindow = value(config, 'rateLimitWindowMs', 15 * 60 * 1000);
  const legacyGeneralMax = value(config, 'rateLimitMax', 200);
  const legacySensitiveMax = value(config, 'sensitiveRateLimitMax', 20);
  const logger = config.logger;
  const make = (settings) => limiter({ ...settings, logger });

  return Object.freeze({
    globalAbuse: make({
      scope: 'global-abuse',
      windowMs: value(config, 'rateLimitGlobalWindowMs', 60_000),
      limit: value(config, 'rateLimitGlobalMax', Math.max(legacyGeneralMax, 1000))
    }),
    authenticatedReadBurst: make({
      scope: 'authenticated-read-burst',
      windowMs: value(config, 'rateLimitReadBurstWindowMs', 10_000),
      limit: value(config, 'rateLimitReadBurstMax', 60),
      keyGenerator: authenticatedKey
    }),
    authenticatedReadSustained: make({
      scope: 'authenticated-read',
      windowMs: value(config, 'rateLimitReadWindowMs', 5 * 60 * 1000),
      limit: value(config, 'rateLimitReadMax', 600),
      keyGenerator: authenticatedKey
    }),
    authentication: make({
      scope: 'authentication',
      windowMs: value(config, 'rateLimitAuthWindowMs', legacyWindow),
      limit: value(config, 'rateLimitAuthMax', legacySensitiveMax),
      keyGenerator: authenticationKey
    }),
    emailDelivery: make({
      scope: 'email-delivery',
      windowMs: value(config, 'rateLimitEmailWindowMs', 60 * 60 * 1000),
      limit: value(config, 'rateLimitEmailMax', 5),
      keyGenerator: emailDeliveryKey
    }),
    sensitiveMutation: make({
      scope: 'sensitive-mutation',
      windowMs: value(config, 'rateLimitSensitiveWindowMs', legacyWindow),
      limit: value(config, 'rateLimitSensitiveMax', legacySensitiveMax),
      keyGenerator: authenticatedKey
    }),
    dataExport: make({
      scope: 'data-export',
      windowMs: value(config, 'rateLimitExportWindowMs', 60 * 60 * 1000),
      limit: value(config, 'rateLimitExportMax', 3),
      keyGenerator: authenticatedKey
    }),
    join: make({
      scope: 'project-join',
      windowMs: value(config, 'rateLimitSensitiveWindowMs', legacyWindow),
      limit: Math.max(1, Math.min(10, value(config, 'rateLimitSensitiveMax', legacySensitiveMax)))
    }),
    sync: make({
      scope: 'github-sync',
      windowMs: value(config, 'rateLimitSensitiveWindowMs', legacyWindow),
      limit: Math.max(1, Math.min(5, value(config, 'rateLimitSensitiveMax', legacySensitiveMax))),
      keyGenerator: (req) => `${authenticatedKey(req)}:project:${req.params.projectId || 'unknown'}`
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
