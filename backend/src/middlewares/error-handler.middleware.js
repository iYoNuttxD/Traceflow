import { env } from '../config/env.js';
import { AppError, ERROR_CODES } from '../shared/errors/index.js';
import { logger as defaultLogger, sanitizeText } from '../shared/logger/index.js';

const defaultInternalMessage = 'Erro interno ao processar solicitação.';

function normalizeKnownError(error) {
  if (error instanceof AppError) return error;
  if (error?.type === 'entity.too.large') {
    return new AppError({
      message: 'Payload excede o limite permitido.',
      statusCode: 413,
      code: ERROR_CODES.PAYLOAD_TOO_LARGE,
      exposeTechnicalDetails: true,
      cause: error
    });
  }
  if (error?.type === 'entity.parse.failed') {
    return new AppError({
      message: 'JSON inválido.',
      statusCode: 400,
      code: ERROR_CODES.MALFORMED_JSON,
      exposeTechnicalDetails: true,
      cause: error
    });
  }
  if (Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode <= 599) {
    return new AppError({
      message: error.message,
      statusCode: error.statusCode,
      code: error.code || ERROR_CODES.INTERNAL_ERROR,
      cause: error
    });
  }
  return null;
}

export function createErrorHandler({ logger = defaultLogger, environment = env.nodeEnv } = {}) {
  return function errorHandler(error, req, res, next) {
    if (res.headersSent) return next(error);

    const knownError = normalizeKnownError(error);
    const requestId = req.requestId || req.context?.requestId;
    const statusCode = knownError?.statusCode || 500;
    const fallbackMessage = sanitizeText(error?.publicFallbackMessage || defaultInternalMessage);
    const message = knownError
      ? knownError.useFallbackMessage ? fallbackMessage : sanitizeText(knownError.message)
      : fallbackMessage;
    const errorCode = knownError?.code || ERROR_CODES.INTERNAL_ERROR;

    logger.error('HTTP request failed.', {
      requestId,
      method: req.method,
      path: req.path,
      statusCode,
      errorCode,
      error: {
        name: error?.name || 'Error',
        message: sanitizeText(error?.message || message),
        ...(environment !== 'production' && error?.stack
          ? { stack: sanitizeText(error.stack) }
          : {})
      }
    });

    if (knownError) {
      return res.status(statusCode).json(knownError.toPublic({ requestId, message }));
    }

    return res.status(500).json({
      message,
      code: ERROR_CODES.INTERNAL_ERROR,
      ...(requestId ? { requestId } : {})
    });
  };
}

export const errorHandlerMiddleware = createErrorHandler();
