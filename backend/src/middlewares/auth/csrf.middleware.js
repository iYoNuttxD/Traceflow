import { AppError, ERROR_CODES } from '../../shared/errors/index.js';
import { authService } from '../../modules/auth/auth.service.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
export function createCsrfMiddleware({ service = authService } = {}) {
  return function csrf(req, res, next) {
    if (SAFE.has(req.method) || service.verifyCsrf(req.auth.session, req.get('X-CSRF-Token'))) return next();
    return next(new AppError({ message: 'Token CSRF inválido.', statusCode: 403, code: ERROR_CODES.CSRF_INVALID, exposeTechnicalDetails: true }));
  };
}
