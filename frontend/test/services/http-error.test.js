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
    ).toMatchObject({
      message: 'Rota não encontrada.',
      status: 404,
      code: 'ROUTE_NOT_FOUND',
      requestId: 'req-frontend',
      isNetworkError: false
    });
  });

  // O texto do axios é técnico e em inglês; exibi-lo era o vazamento que o usuário via
  // no lugar das mensagens escritas nas telas.
  it('diferencia erro de rede e nunca exibe a mensagem técnica do axios', () => {
    expect(normalizeApiError({ message: 'Network Error' })).toMatchObject({
      message: 'Não foi possível concluir a operação.',
      status: undefined,
      code: undefined,
      requestId: undefined,
      isNetworkError: true
    });
  });

  it('prefere o fallback do chamador à mensagem técnica do axios', () => {
    const semCorpo = normalizeApiError(
      { message: 'Request failed with status code 500', response: { status: 500, data: {} } },
      'Não foi possível salvar a sprint.'
    );
    expect(semCorpo.message).toBe('Não foi possível salvar a sprint.');
    expect(semCorpo.status).toBe(500);
    // A mensagem técnica continua acessível para depuração, fora do payload exibível.
    expect(semCorpo.original.message).toBe('Request failed with status code 500');
  });

  it('a mensagem do backend ainda vence o fallback do chamador', () => {
    expect(
      normalizeApiError(
        {
          message: 'Request failed with status code 409',
          response: { status: 409, data: { message: 'Já existe uma sprint com este nome.' } }
        },
        'Não foi possível salvar a sprint.'
      ).message
    ).toBe('Já existe uma sprint com este nome.');
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
