import { AppError, ERROR_CODES } from '../../shared/errors/index.js';
import { authService } from '../../modules/auth/auth.service.js';

export function parseCookies(header = '') {
  const cookies = {};
  for (const rawPart of String(header).split(';')) {
    const part = rawPart.trim();
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    try {
      cookies[decodeURIComponent(part.slice(0, separator))] = decodeURIComponent(
        part.slice(separator + 1)
      );
    } catch {
      // Cookies malformados são ignorados e o fluxo normal os trata como ausentes.
    }
  }
  return cookies;
}

export function createAuthenticationMiddleware({ service = authService, cookieName }) {
  return async function authenticate(req, res, next) {
    try {
      if (req.auth?.user && req.auth?.session) return next();
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
