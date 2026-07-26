import { AppError, ERROR_CODES } from '../../shared/errors/index.js';
import { authService } from '../../modules/auth/auth.service.js';

export function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf('=');
        return [
          decodeURIComponent(part.slice(0, separator)),
          decodeURIComponent(part.slice(separator + 1))
        ];
      })
  );
}

export function createAuthenticationMiddleware({ service = authService, cookieName }) {
  return async function authenticate(req, res, next) {
    try {
      const auth = await service.authenticate(parseCookies(req.headers.cookie)[cookieName]);
      if (!auth)
        return next(
          new AppError({
            message: 'Autenticação necessária.',
            statusCode: 401,
            code: ERROR_CODES.AUTHENTICATION_REQUIRED,
            exposeTechnicalDetails: true
          })
        );
      req.auth = auth;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
