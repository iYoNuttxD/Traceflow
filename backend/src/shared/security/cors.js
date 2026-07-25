import cors from 'cors';
import { AppError, ERROR_CODES } from '../errors/index.js';

function corsError(message) {
  return new AppError({
    message,
    statusCode: 403,
    code: ERROR_CODES.CORS_ORIGIN_DENIED,
    exposeTechnicalDetails: true
  });
}

function requestedHeaders(req) {
  return String(req.get('Access-Control-Request-Headers') || '')
    .split(',')
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);
}

export function createCorsMiddleware({
  corsAllowedOrigins,
  corsAllowedMethods,
  corsAllowedHeaders
}) {
  const origins = new Set(corsAllowedOrigins);
  const methods = new Set(corsAllowedMethods.map((method) => method.toUpperCase()));
  const headers = new Set(corsAllowedHeaders.map((header) => header.toLowerCase()));

  const enforcePreflightPolicy = (req, res, next) => {
    const origin = req.get('Origin');
    if (origin && !origins.has(origin)) {
      return next(corsError('Origem não permitida.'));
    }

    if (req.method === 'OPTIONS' && origin) {
      const requestedMethod = req.get('Access-Control-Request-Method')?.toUpperCase();
      if (requestedMethod && !methods.has(requestedMethod)) {
        return next(corsError('Método não permitido pela política CORS.'));
      }
      if (requestedHeaders(req).some((header) => !headers.has(header))) {
        return next(corsError('Header não permitido pela política CORS.'));
      }
    }

    return next();
  };

  const corsMiddleware = cors({
    origin(origin, callback) {
      callback(null, !origin || origins.has(origin));
    },
    methods: [...methods],
    allowedHeaders: corsAllowedHeaders,
    credentials: true,
    maxAge: 600,
    optionsSuccessStatus: 204
  });

  return [enforcePreflightPolicy, corsMiddleware];
}
