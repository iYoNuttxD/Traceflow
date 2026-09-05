import { describe, expect, it } from 'vitest';
import { normalizeApiError } from '../../src/shared/services/http-error.js';

describe('normalização mínima de erros HTTP', () => {
  it.each([
    [400, 'Revise os dados informados e tente novamente.'],
    [401, 'Sua sessão não é válida. Entre novamente para continuar.'],
    [403, 'Você não possui permissão para realizar esta ação.'],
    [404, 'O recurso solicitado não foi encontrado.'],
    [409, 'A operação entrou em conflito com o estado atual. Atualize os dados e tente novamente.'],
    [429, 'Muitas solicitações foram realizadas. Aguarde antes de tentar novamente.']
  ])('fornece orientação segura para HTTP %s sem mensagem pública', (status, message) => {
    expect(normalizeApiError({ response: { status, data: {}, headers: {} } })).toMatchObject({
      status,
      message
    });
  });

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

  it('diferencia erro de rede sem exibir a mensagem técnica do cliente', () => {
    expect(normalizeApiError({ message: 'Network Error' })).toMatchObject({
      message:
        'Não foi possível conectar ao servidor do TRACEFLOW. Verifique sua conexão e tente novamente.',
      status: undefined,
      code: undefined,
      requestId: undefined,
      isNetworkError: true
    });
  });

  it('mantém erro interno genérico em vez da mensagem técnica ou do fallback contextual', () => {
    const semCorpo = normalizeApiError(
      { message: 'Request failed with status code 500', response: { status: 500, data: {} } },
      'Não foi possível salvar a sprint.'
    );
    expect(semCorpo.message).toBe(
      'O TRACEFLOW encontrou um problema interno. Tente novamente em instantes.'
    );
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
    ).toMatchObject({
      message: 'O TRACEFLOW encontrou um problema interno. Tente novamente em instantes.',
      requestId: 'req-header',
      isNetworkError: false
    });
  });

  it('não exibe mensagem, field error ou request ID de formato técnico', () => {
    const normalized = normalizeApiError({
      response: {
        status: 400,
        data: {
          message: 'PrismaClientKnownRequestError: SQLSTATE 23000',
          requestId: '<script>alert(1)</script>',
          details: [
            { field: 'body.email', message: 'TypeError: stack em /Users/alguem/app.js' },
            { field: 'body.name', message: 'Informe seu nome.' }
          ]
        },
        headers: {}
      }
    });

    expect(normalized.message).toBe('Revise os dados informados e tente novamente.');
    expect(normalized.fieldErrors).toEqual({ name: 'Informe seu nome.' });
    expect(normalized.requestId).toBeUndefined();
  });

  it('diferencia timeout de indisponibilidade de rede', () => {
    expect(
      normalizeApiError({ code: 'ECONNABORTED', message: 'timeout of 15000ms exceeded' })
    ).toMatchObject({
      message: 'A solicitação demorou mais que o esperado. Tente novamente.',
      isNetworkError: true,
      isTimeout: true
    });
  });

  it('preserva o código e a orientação de verificação de e-mail', () => {
    expect(
      normalizeApiError({
        response: {
          status: 403,
          data: {
            code: 'EMAIL_VERIFICATION_REQUIRED',
            message: 'Verifique seu e-mail para realizar esta ação.'
          },
          headers: {}
        }
      })
    ).toMatchObject({
      status: 403,
      code: 'EMAIL_VERIFICATION_REQUIRED',
      message: 'Verifique seu e-mail para realizar esta ação.',
      isNetworkError: false
    });
  });

  it('normaliza o prazo e o escopo de um 429 sem expor detalhes internos', () => {
    expect(
      normalizeApiError({
        response: {
          status: 429,
          data: {
            code: 'RATE_LIMITED',
            message: 'Muitas requisições.',
            retryAfterSeconds: 18,
            scope: 'authenticated-read'
          },
          headers: { 'retry-after': '18' }
        }
      })
    ).toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
      retryAfterSeconds: 18,
      scope: 'authenticated-read'
    });
  });

  it('usa fallback finito quando o rate limit não informa prazo', () => {
    expect(normalizeApiError({ response: { status: 429, data: {}, headers: {} } })).toMatchObject({
      retryAfterSeconds: 60
    });
  });

  it('aceita headers com capitalização HTTP convencional', () => {
    expect(
      normalizeApiError({
        response: {
          status: 429,
          data: {},
          headers: { 'Retry-After': '7', 'X-Request-Id': 'req-case-insensitive' }
        }
      })
    ).toMatchObject({ retryAfterSeconds: 7, requestId: 'req-case-insensitive' });
  });
});
