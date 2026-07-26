import { NotFoundError } from '../shared/errors/index.js';

export function notFoundMiddleware(req, res, next) {
  return next(new NotFoundError());
}
