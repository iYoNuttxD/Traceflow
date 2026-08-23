import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ValidationError } from '../../src/shared/errors/index.js';
import {
  dateOnly,
  githubUrl,
  positiveInteger,
  queryBoolean,
  requiredText,
  strictObject,
  validateRequest
} from '../../src/shared/validation/index.js';
import { resetBodySchema, verifyEmailBodySchema } from '../../src/modules/auth/auth.validation.js';
import { acceptInvitationBody } from '../../src/modules/projects/project-invitation.validation.js';
import { tokenQuery } from '../../src/modules/settings/settings.validation.js';

function execute(schemas, request) {
  const next = vi.fn();
  validateRequest(schemas)(request, {}, next);
  return { next, result: next.mock.calls[0]?.[0] };
}

describe('infraestrutura de validação HTTP', () => {
  it('valida e converte params inteiros positivos explicitamente', () => {
    const request = { params: { id: '10' }, query: {}, body: {} };
    const { result } = execute({ params: strictObject({ id: positiveInteger() }) }, request);
    expect(result).toBeUndefined();
    expect(request.params).toEqual({ id: 10 });
  });

  it.each(['0', '-1', '1.5', 'qualquer'])('rejeita param inválido %s sem truncar', (id) => {
    const { result } = execute(
      { params: strictObject({ id: positiveInteger('ID inválido.') }) },
      { params: { id }, query: {}, body: {} }
    );
    expect(result).toBeInstanceOf(ValidationError);
    expect(result.details).toEqual([{ field: 'id', message: 'ID inválido.' }]);
  });

  it('valida body, rejeita ausência e substitui pelo valor normalizado', () => {
    const schema = strictObject({ title: requiredText({ message: 'Título obrigatório.' }) });
    const valid = { params: {}, query: {}, body: { title: '  Tarefa  ' } };
    expect(execute({ body: schema }, valid).result).toBeUndefined();
    expect(valid.body).toEqual({ title: 'Tarefa' });

    const missing = execute({ body: schema }, { params: {}, query: {}, body: {} }).result;
    expect(missing).toBeInstanceOf(ValidationError);
    expect(missing.message).toBe('Título obrigatório.');
  });

  it('converte somente booleanos de query explicitamente permitidos', () => {
    const schema = strictObject({ enabled: queryBoolean });
    const valid = { params: {}, query: { enabled: 'false' }, body: {} };
    expect(execute({ query: schema }, valid).result).toBeUndefined();
    expect(valid.query.enabled).toBe(false);
    expect(
      execute(
        { query: schema },
        {
          params: {},
          query: { enabled: 'sim' },
          body: {}
        }
      ).result
    ).toBeInstanceOf(ValidationError);
  });

  it('rejeita campo desconhecido, texto excessivo, enum, data e URL inválidos', () => {
    const schema = strictObject({
      title: requiredText({ max: 5 }),
      status: z.enum(['ATIVO']),
      date: dateOnly(),
      repositoryUrl: githubUrl
    });
    const result = execute(
      { body: schema },
      {
        params: {},
        query: {},
        body: {
          title: 'excessivo',
          status: 'OUTRO',
          date: '2026-02-30',
          repositoryUrl: 'https://example.com/repo',
          token: 'segredo-que-nao-pode-voltar'
        }
      }
    ).result;

    expect(result).toBeInstanceOf(ValidationError);
    expect(result.details.map((detail) => detail.field)).toEqual(
      expect.arrayContaining(['title', 'status', 'date', 'repositoryUrl', 'token'])
    );
    expect(JSON.stringify(result.details)).not.toContain('segredo-que-nao-pode-voltar');
    expect(JSON.stringify(result.details)).not.toContain('Zod');
  });

  it.each([
    [
      { body: verifyEmailBodySchema },
      { params: {}, query: {}, body: { token: 'invalid' } },
      'Link de verificação inválido ou expirado.'
    ],
    [
      { body: resetBodySchema },
      { params: {}, query: {}, body: { token: 'invalid', password: 'NovaSenhaSegura123' } },
      'Link de redefinição de senha inválido ou expirado.'
    ],
    [
      { body: acceptInvitationBody },
      { params: {}, query: {}, body: { token: 'invalid' } },
      'Convite inválido.'
    ],
    [
      { query: tokenQuery },
      { params: {}, query: { token: 'invalid' }, body: {} },
      'Link inválido ou expirado.'
    ]
  ])('sanitiza capability pública curta sem mensagem técnica', (schemas, request, message) => {
    const { result } = execute(schemas, request);
    expect(result).toBeInstanceOf(ValidationError);
    expect(result.message).toBe(message);
    expect(JSON.stringify(result.details)).not.toMatch(/expected string|too small|>=\s*32/i);
  });

  it.each([undefined, 123, null])('sanitiza capability pública de tipo inválido (%s)', (token) => {
    const { result } = execute(
      { body: verifyEmailBodySchema },
      { params: {}, query: {}, body: { token } }
    );
    expect(result).toBeInstanceOf(ValidationError);
    expect(result.message).toBe('Link de verificação inválido ou expirado.');
    expect(JSON.stringify(result.details)).not.toMatch(/expected string|invalid input|zod/i);
  });
});
