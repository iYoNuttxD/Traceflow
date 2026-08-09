export function normalizeApiError(
  error,
  fallbackMessage = 'Não foi possível concluir a operação.'
) {
  const response = error?.response;
  const data = response?.data && typeof response.data === 'object' ? response.data : {};
  const requestId = data.requestId || response?.headers?.['x-request-id'];

  const fieldErrors = Array.isArray(data.details)
    ? Object.freeze(
        Object.fromEntries(
          data.details
            .filter(
              (detail) => typeof detail?.field === 'string' && typeof detail?.message === 'string'
            )
            .map((detail) => [detail.field.replace(/^(?:body|params|query)\./, ''), detail.message])
        )
      )
    : Object.freeze({});
  const normalized = {
    // Precedência: mensagem do backend (já segura e em português) > texto explícito do
    // chamador > genérico. A mensagem do axios ('Network Error', 'Request failed with
    // status code 500') nunca chega ao usuário: é técnica, em inglês, e vaza detalhe de
    // infraestrutura. Ela continua disponível em `original` para depuração.
    message: typeof data.message === 'string' && data.message ? data.message : fallbackMessage,
    status: Number.isInteger(response?.status) ? response.status : undefined,
    code: typeof data.code === 'string' ? data.code : undefined,
    fieldErrors,
    requestId: typeof requestId === 'string' ? requestId : undefined,
    isNetworkError: !response,
    isCanceled: error?.code === 'ERR_CANCELED'
  };
  Object.defineProperty(normalized, 'original', { value: error, enumerable: false });
  return Object.freeze(normalized);
}
