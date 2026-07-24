export function normalizeApiError(error, fallbackMessage = 'Não foi possível concluir a operação.') {
  const response = error?.response;
  const data = response?.data && typeof response.data === 'object' ? response.data : {};
  const requestId = data.requestId || response?.headers?.['x-request-id'];

  return Object.freeze({
    message: typeof data.message === 'string' && data.message
      ? data.message
      : error?.message || fallbackMessage,
    status: Number.isInteger(response?.status) ? response.status : undefined,
    code: typeof data.code === 'string' ? data.code : undefined,
    requestId: typeof requestId === 'string' ? requestId : undefined,
    isNetworkError: !response
  });
}
