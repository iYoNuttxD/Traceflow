import { describe, expect, it } from 'vitest';
import {
  REPORT_POLL_RETRIES,
  pollRetryDelay
} from '../../src/features/reports/model/report-polling.js';

describe('S2-06 — nova tentativa do acompanhamento da geração', () => {
  it('rede e 5xx tentam de novo com espera crescente até o limite', () => {
    const network = { message: 'sem conexão' };
    expect(pollRetryDelay(network, 1, 1000)).toBe(1000);
    expect(pollRetryDelay({ status: 503 }, 2, 1000)).toBe(2000);
    expect(pollRetryDelay({ status: 408 }, 3, 1000)).toBe(4000);
    expect(pollRetryDelay({ status: 500 }, REPORT_POLL_RETRIES + 1, 1000)).toBeNull();
  });

  it('sessão, permissão, relatório inexistente e outros 4xx param na hora', () => {
    for (const status of [400, 401, 403, 404, 409])
      expect(pollRetryDelay({ status }, 1, 1000)).toBeNull();
  });

  it('429 espera o Retry-After informado', () => {
    expect(pollRetryDelay({ status: 429, retryAfterSeconds: 12 }, 1, 1000)).toBe(12000);
    expect(pollRetryDelay({ status: 429 }, 1, 1000)).toBe(1000);
  });

  it('sem erro não há nova tentativa a agendar', () => {
    expect(pollRetryDelay(null, 0, 1000)).toBeNull();
  });
});
