import { ValidationError } from '../errors/index.js';
import { mapValidationIssues } from './validation-error.mapper.js';

const locations = ['params', 'query', 'body'];

export function validateRequest(schemas = {}) {
  return function validateRequestMiddleware(req, res, next) {
    for (const location of locations) {
      const schema = schemas[location];
      if (!schema) continue;

      const result = schema.safeParse(req[location]);
      if (!result.success) {
        const details = mapValidationIssues(result.error.issues, location);
        return next(
          new ValidationError({
            message: details[0]?.message || 'Dados inválidos.',
            details,
            cause: result.error
          })
        );
      }

      req[location] = result.data;
    }

    return next();
  };
}
