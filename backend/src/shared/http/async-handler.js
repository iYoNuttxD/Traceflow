export function asyncHandler(handler, { fallbackMessage } = {}) {
  return async function handledRequest(req, res, next) {
    try {
      return await handler(req, res, next);
    } catch (error) {
      if (fallbackMessage && error && typeof error === 'object') {
        error.publicFallbackMessage = fallbackMessage;
      }
      return next(error);
    }
  };
}
