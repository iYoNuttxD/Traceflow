import { ERROR_CODES } from './error-codes.js';

export class AppError extends Error {
  constructor({
    message,
    statusCode = 500,
    code = ERROR_CODES.INTERNAL_ERROR,
    details,
    cause,
    isOperational = true,
    exposeTechnicalDetails = false,
    useFallbackMessage = false
  }) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;
    this.exposeTechnicalDetails = exposeTechnicalDetails;
    this.useFallbackMessage = useFallbackMessage;
  }

  toPublic({ requestId, message = this.message } = {}) {
    const payload = { message };

    if (this.exposeTechnicalDetails) {
      payload.code = this.code;
      if (Array.isArray(this.details) && this.details.length > 0) {
        payload.details = this.details;
      }
      if (requestId) payload.requestId = requestId;
    }

    return payload;
  }
}
