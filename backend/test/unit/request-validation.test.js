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
});
