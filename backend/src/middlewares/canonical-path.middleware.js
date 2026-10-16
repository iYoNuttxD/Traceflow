import { AppError, ERROR_CODES } from '../shared/errors/index.js';

const MAX_LOGGED_PATH = 200;

export const isCanonicalPath = (path) => !path.includes('%');

export function createCanonicalPathMiddleware({ logger }) {
  return function rejectNonCanonicalPath(req, res, next) {
    if (isCanonicalPath(req.path)) return next();
    logger.warn('Caminho da API com escape percentual recusado.', {
      event: 'api_path_not_canonical',
      requestId: req.requestId,
      method: req.method,
      path: `${req.baseUrl}${req.path}`.slice(0, MAX_LOGGED_PATH)
    });
    return next(
      new AppError({
        message: 'Recurso não encontrado.',
        statusCode: 404,
        code: ERROR_CODES.RESOURCE_NOT_FOUND,
        exposeTechnicalDetails: true
      })
    );
  };
}
