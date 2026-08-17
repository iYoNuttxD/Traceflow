// Origem unica do 404 de recurso enderecado por ID (ADR-010 D16). O middleware
// de autorizacao e os services constroem a resposta por aqui; se os dois
// divergirem, o par vira oraculo de enumeracao.
import { describe, expect, it } from 'vitest';
import {
  NOT_FOUND_RESOURCE_TYPES,
  resourceNotFoundError
} from '../../src/shared/errors/resource-not-found.js';

describe('resourceNotFoundError', () => {
  it.each([
    ['Project', 'PROJECT_NOT_FOUND', 'Projeto não encontrado.', false],
    ['Requirement', 'REQUIREMENT_NOT_FOUND', 'Requisito não encontrado.', false],
    ['Task', 'TASK_NOT_FOUND', 'Tarefa não encontrada.', false],
    ['Sprint', 'SPRINT_NOT_FOUND', 'Sprint não encontrada.', true],
    ['Milestone', 'MILESTONE_NOT_FOUND', 'Marco não encontrado.', true]
  ])('%s responde 404 com codigo e exposicao proprios', (tipo, codigo, mensagem, expoe) => {
    const erro = resourceNotFoundError(tipo);
    expect(erro.statusCode).toBe(404);
    expect(erro.code).toBe(codigo);
    expect(erro.message).toBe(mensagem);
    // A exposicao segue o contrato ja publicado de cada recurso; o que a
    // seguranca exige e que os DOIS caminhos do mesmo recurso coincidam.
    expect(erro.exposeTechnicalDetails).toBe(expoe);
    expect(erro.toPublic()).toEqual(
      expoe ? { message: mensagem, code: codigo } : { message: mensagem }
    );
  });

  // Caminho nao mapeado nao pode revelar mais do que a tabela conhece: sem
  // fallback, um recurso novo passaria a responder `undefined` como codigo.
  it.each([undefined, null, 'Comentario'])('cai no generico para %s', (tipo) => {
    const erro = resourceNotFoundError(tipo);
    expect(erro.statusCode).toBe(404);
    expect(erro.code).toBe('RESOURCE_NOT_FOUND');
    expect(erro.message).toBe('Recurso não encontrado.');
  });

  it('expoe os tipos mapeados para quem precisa iterar', () => {
    expect(NOT_FOUND_RESOURCE_TYPES).toEqual([
      'Project',
      'Requirement',
      'Task',
      'Sprint',
      'Milestone'
    ]);
  });

  // Duas chamadas nao podem compartilhar instancia: um handler que anexasse
  // `requestId` no erro contaminaria a resposta seguinte.
  it('devolve uma instancia nova a cada chamada', () => {
    expect(resourceNotFoundError('Sprint')).not.toBe(resourceNotFoundError('Sprint'));
  });
});
