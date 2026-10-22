// Nova tentativa do acompanhamento de uma geração (QUEUED/RUNNING). Falha transitória
// (rede, 408, 5xx) tenta de novo sozinha, com espera crescente e um limite; 429 espera o
// Retry-After; sessão, permissão ou relatório inexistente param na hora. Quando a
// atualização para, a tela mostra o erro com "Tentar novamente".
export const REPORT_POLL_RETRIES = 3;

const STOP_STATUSES = new Set([401, 403, 404]);

// `failures` conta as falhas seguidas (1 na primeira). Devolve a espera em ms ou null.
export function pollRetryDelay(error, failures, pollMs) {
  if (!error || failures > REPORT_POLL_RETRIES || STOP_STATUSES.has(error.status)) return null;
  if (error.status === 429) return Math.max(pollMs, (error.retryAfterSeconds ?? 0) * 1000);
  if (error.status && error.status < 500 && error.status !== 408) return null;
  return pollMs * 2 ** (failures - 1);
}
