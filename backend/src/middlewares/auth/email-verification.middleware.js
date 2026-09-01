import { AppError, ERROR_CODES } from '../../shared/errors/index.js';

export function requireVerifiedEmail(req, res, next) {
  if (req.auth?.user?.emailVerifiedAt) return next();
  return next(
    new AppError({
      message: 'Verifique seu e-mail para realizar esta ação.',
      statusCode: 403,
      code: ERROR_CODES.EMAIL_VERIFICATION_REQUIRED,
      exposeTechnicalDetails: true
    })
  );
}
