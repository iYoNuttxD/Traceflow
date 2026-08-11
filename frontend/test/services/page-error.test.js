import { describe, expect, it } from 'vitest';
import {
  PAGE_ERROR_TYPES,
  classifyPageError,
  isAuthenticationFailure,
  isNetworkOrServiceUnavailable,
  resolveErrorPageContext
} from '../../src/shared/services/page-error.js';

describe('classificação de falhas de página', () => {
  it.each([
    [{ isAxiosError: true, code: 'ERR_NETWORK', request: {} }, true],
    [{ isAxiosError: true, code: 'ECONNABORTED', request: {} }, true],
    [{ code: 'ECONNREFUSED' }, true],
    [{ response: { status: 502 } }, true],
    [{ response: { status: 503 } }, true],
    [{ response: { status: 504 } }, true],
    [{ response: { status: 429 } }, false],
    [{ response: { status: 401 } }, false],
    [{ response: { status: 403 } }, false],
    [{ response: { status: 422 } }, false]
  ])('classifica indisponibilidade sem englobar erros funcionais', (error, expected) => {
    expect(isNetworkOrServiceUnavailable(error)).toBe(expected);
  });

  it('distingue códigos de sessão mesmo quando o cliente HTTP possui código próprio', () => {
    expect(
      isAuthenticationFailure({
        code: 'ERR_BAD_REQUEST',
        response: { status: 401, data: { code: 'SESSION_EXPIRED' } }
      })
    ).toBe(true);
  });

  it('mapeia apenas falhas fatais para categorias de página', () => {
    expect(classifyPageError({ response: { status: 404 } })).toBe(PAGE_ERROR_TYPES.NOT_FOUND);
    expect(classifyPageError({ response: { status: 403 } })).toBe(PAGE_ERROR_TYPES.FORBIDDEN);
    expect(classifyPageError({ response: { status: 500 } })).toBe(PAGE_ERROR_TYPES.SERVER);
    expect(classifyPageError(new Error('render'))).toBe(PAGE_ERROR_TYPES.UNKNOWN);
  });

  it('nunca assume contexto de projeto fora de uma rota de projeto', () => {
    expect(resolveErrorPageContext('/login').secondaryAction).toBeNull();
    expect(resolveErrorPageContext('/settings/account').secondaryAction).toEqual({
      label: 'Ir para projetos',
      href: '/projects'
    });
    expect(resolveErrorPageContext('/qualquer').secondaryAction).toEqual({
      label: 'Ir para o início',
      href: '/'
    });
  });
});
