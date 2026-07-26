import { AppError, ERROR_CODES } from '../errors/index.js';

const methodsWithBody = new Set(['POST', 'PUT', 'PATCH']);

export function requireJsonContentType(req, res, next) {
  if (!methodsWithBody.has(req.method)) return next();
  const contentLength = Number(req.get('Content-Length') || 0);
  const hasBody = contentLength > 0 || Boolean(req.get('Transfer-Encoding'));
  if (!hasBody || req.is('application/json')) return next();

  return next(
    new AppError({
      message: 'Content-Type não suportado. Use application/json.',
      statusCode: 415,
      code: ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
      exposeTechnicalDetails: true
    })
  );
}
