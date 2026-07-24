import { AppError } from './app-error.js';
import { ERROR_CODES } from './error-codes.js';

function codeForStatus(statusCode) {
  if (statusCode === 404) return ERROR_CODES.RESOURCE_NOT_FOUND;
  if (statusCode === 409) return ERROR_CODES.CONFLICT;
  return ERROR_CODES.VALIDATION_ERROR;
}

export class DomainError extends AppError {
  constructor(message, statusCode = 400, code = codeForStatus(statusCode), options = {}) {
    super({ message, statusCode, code, ...options });
    this.name = 'DomainError';
  }
}

export class ConfigurationError extends AppError {
  constructor(message, options = {}) {
    super({
      message,
      statusCode: 500,
      code: ERROR_CODES.CONFIGURATION_ERROR,
      isOperational: false,
      ...options
    });
    this.name = 'ConfigurationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Rota não encontrada.', options = {}) {
    super({
      message,
      statusCode: 404,
      code: ERROR_CODES.ROUTE_NOT_FOUND,
      exposeTechnicalDetails: true,
      ...options
    });
    this.name = 'NotFoundError';
  }
}

export class ExternalServiceError extends AppError {
  constructor(message, statusCode = 502, code = ERROR_CODES.EXTERNAL_SERVICE_ERROR, options = {}) {
    super({ message, statusCode, code, useFallbackMessage: true, ...options });
    this.name = 'ExternalServiceError';
  }
}
