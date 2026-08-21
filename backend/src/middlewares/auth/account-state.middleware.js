import { AppError, ERROR_CODES } from '../../shared/errors/index.js';

const restrictedAccess = Object.freeze({
  DEACTIVATED: [
    ['GET', '/settings/account'],
    ['POST', '/account/reactivation/start']
  ],
  DELETION_PENDING: [
    ['GET', '/settings/account'],
    ['GET', '/settings/privacy/deletion'],
    ['DELETE', '/settings/privacy/deletion'],
    ['POST', '/settings/privacy/export'],
    ['POST', '/github/reauth/start']
  ]
});

function allowed(req, status) {
  return (restrictedAccess[status] || []).some(
    ([method, path]) => req.method === method && req.path === path
  );
}

export function requireAccountState(req, res, next) {
  const status =
    req.auth?.user?.accountStatus || (req.auth?.user?.isActive ? 'ACTIVE' : 'DEACTIVATED');
  if (status === 'ACTIVE' || allowed(req, status)) return next();
  const code =
    status === 'DELETION_PENDING'
      ? ERROR_CODES.ACCOUNT_DELETION_PENDING
      : status === 'ANONYMIZED'
        ? ERROR_CODES.ACCOUNT_ANONYMIZED
        : ERROR_CODES.ACCOUNT_DEACTIVATED;
  return next(
    new AppError({
      message: 'O estado atual da conta não permite esta operação.',
      statusCode: 403,
      code,
      exposeTechnicalDetails: true
    })
  );
}
