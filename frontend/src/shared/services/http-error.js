const STATUS_FALLBACK_MESSAGES = Object.freeze({
  400: 'Revise os dados informados e tente novamente.',
  401: 'Sua sessão não é válida. Entre novamente para continuar.',
  403: 'Você não possui permissão para realizar esta ação.',
  404: 'O recurso solicitado não foi encontrado.',
  409: 'A operação entrou em conflito com o estado atual. Atualize os dados e tente novamente.',
  429: 'Muitas solicitações foram realizadas. Aguarde antes de tentar novamente.'
});

const SESSION_ERROR_CODES = new Set([
  'AUTHENTICATION_REQUIRED',
  'SESSION_INVALID',
  'SESSION_EXPIRED'
]);
const TECHNICAL_MESSAGE =
  /(?:prisma|\bP\d{4}\b|stack|node_modules|(?:file|webpack|vite):\/\/|\/(?:users|home|var|opt|app|srv|tmp)\/|[a-z]:\\|sqlstate|sequelize|syntaxerror|typeerror|referenceerror|error:\s|\bat\s+\S+\s*\(|cannot\s+(?:get|post|put|patch|delete)\s+\/)/i;
const TIMEOUT_CODES = new Set(['ECONNABORTED', 'ETIMEDOUT']);

function isSafeText(value) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.trim().length <= 500 &&
    !TECHNICAL_MESSAGE.test(value)
  );
}

function headerValue(headers, name) {
  const direct = headers?.[name] ?? headers?.get?.(name);
  if (direct !== undefined) return direct;
  if (!headers || typeof headers !== 'object') return undefined;
  const matchingKey = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
  return matchingKey ? headers[matchingKey] : undefined;
}

function normalizeRetryAfter(data, headers, status) {
  const raw = data.retryAfterSeconds ?? headerValue(headers, 'retry-after');
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return Math.ceil(numeric);

  if (typeof raw === 'string') {
    const timestamp = Date.parse(raw);
    if (Number.isFinite(timestamp)) {
      const seconds = Math.ceil((timestamp - Date.now()) / 1000);
      if (seconds > 0) return seconds;
    }
  }

  return status === 429 ? 60 : undefined;
}

function normalizeRequestId(value) {
  if (typeof value !== 'string') return undefined;
  const requestId = value.trim();
  return requestId && requestId.length <= 191 && /^[\w.:-]+$/u.test(requestId)
    ? requestId
    : undefined;
}

function safeServerMessage(data, status) {
  if (status >= 500 || !isSafeText(data.message)) return undefined;
  return data.message.trim();
}

function userMessage({ error, data, status, code, fallbackMessage, isCanceled, hasResponse }) {
  if (isCanceled) return 'A solicitação foi cancelada.';
  if (!hasResponse) {
    return TIMEOUT_CODES.has(error?.code)
      ? 'A solicitação demorou mais que o esperado. Tente novamente.'
      : 'Não foi possível conectar ao servidor do TRACEFLOW. Verifique sua conexão e tente novamente.';
  }
  if ([502, 503, 504].includes(status)) {
    return 'O serviço está temporariamente indisponível. Tente novamente em instantes.';
  }
  if (status >= 500) {
    return 'O TRACEFLOW encontrou um problema interno. Tente novamente em instantes.';
  }
  if (status === 401 && SESSION_ERROR_CODES.has(code)) return STATUS_FALLBACK_MESSAGES[401];
  return safeServerMessage(data, status) || STATUS_FALLBACK_MESSAGES[status] || fallbackMessage;
}

export function normalizeApiError(
  error,
  fallbackMessage = 'Não foi possível concluir a operação.'
) {
  const response = error?.response;
  const data = response?.data && typeof response.data === 'object' ? response.data : {};
  const status = Number.isInteger(response?.status) ? response.status : undefined;
  const code = typeof data.code === 'string' ? data.code : undefined;
  const requestId = normalizeRequestId(
    data.requestId || headerValue(response?.headers, 'x-request-id')
  );
  const isCanceled = error?.code === 'ERR_CANCELED';

  const fieldErrors = Array.isArray(data.details)
    ? Object.freeze(
        Object.fromEntries(
          data.details
            .filter((detail) => typeof detail?.field === 'string' && isSafeText(detail?.message))
            .map((detail) => [
              detail.field.replace(/^(?:body|params|query)\./, ''),
              detail.message.trim()
            ])
        )
      )
    : Object.freeze({});
  const normalized = {
    message: userMessage({
      error,
      data,
      status,
      code,
      fallbackMessage,
      isCanceled,
      hasResponse: Boolean(response)
    }),
    status,
    code,
    fieldErrors,
    requestId,
    retryAfterSeconds: normalizeRetryAfter(data, response?.headers, status),
    scope: typeof data.scope === 'string' ? data.scope : undefined,
    isNetworkError: !response && !isCanceled,
    isTimeout: !response && TIMEOUT_CODES.has(error?.code),
    isCanceled
  };
  Object.defineProperty(normalized, 'original', { value: error, enumerable: false });
  return Object.freeze(normalized);
}
