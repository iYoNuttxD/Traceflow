import { describe, expect, it } from 'vitest';
import { normalizeApiError } from '../../src/shared/services/http-error.js';

describe('normalização mínima de erros HTTP', () => {
  it('preserva mensagem, status, código e request ID do backend', () => {
    expect(
      normalizeApiError({
        response: {
          status: 404,
          data: {
            message: 'Rota não encontrada.',
            code: 'ROUTE_NOT_FOUND',
            requestId: 'req-frontend'
          },
          headers: {}
        }
      })
    ).toEqual({
      message: 'Rota não encontrada.',
      status: 404,
      code: 'ROUTE_NOT_FOUND',
      requestId: 'req-frontend',
      isNetworkError: false
    });
  });

  it('diferencia erro de rede e usa mensagem segura disponível', () => {
    expect(normalizeApiError({ message: 'Network Error' })).toEqual({
      message: 'Network Error',
      status: undefined,
      code: undefined,
      requestId: undefined,
      isNetworkError: true
    });
  });

  it('aceita request ID recebido apenas no header', () => {
    expect(
      normalizeApiError({
        response: {
          status: 500,
          data: { message: 'Erro interno.' },
          headers: { 'x-request-id': 'req-header' }
        }
      })
    ).toMatchObject({ requestId: 'req-header', isNetworkError: false });
  });
});
