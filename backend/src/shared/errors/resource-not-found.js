import { AppError } from './app-error.js';
import { ERROR_CODES } from './error-codes.js';

// Origem UNICA do 404 de recurso endereçado por ID.
//
// O middleware de autorização barra o recurso que existe mas pertence a projeto
// alheio; o service recusa o ID que não existe. Se as duas respostas diferirem
// em status, código, mensagem ou até na presença de `code`, o par vira oráculo
// de enumeração: basta iterar o ID para descobrir quais recursos existem fora do
// alcance do ator. Antes desta unificação as duas divergiam em todos esses
// pontos — o middleware respondia `RESOURCE_NOT_FOUND` com código exposto, e o
// service de tarefas respondia "Tarefa não encontrada." sem código nenhum.
//
// Manter o vocabulário por recurso (e não colapsar tudo em RESOURCE_NOT_FOUND)
// preserva a informação de que um cliente legítimo precisa: saber QUE tipo de
// recurso não foi encontrado não revela nada sobre a existência dele.
// `expose` acompanha o contrato já publicado de cada recurso: o RF10 promete
// código estável em sprint e marco, enquanto o contrato do MVP devolve apenas
// `{ message }` em projeto, requisito e tarefa. O que a unificação exige não é
// que todos exponham o mesmo, e sim que os DOIS CAMINHOS do mesmo recurso —
// service e middleware — exponham exatamente igual.
const NOT_FOUND_BY_RESOURCE = Object.freeze({
  Project: {
    code: ERROR_CODES.PROJECT_NOT_FOUND,
    message: 'Projeto não encontrado.',
    expose: false
  },
  Requirement: {
    code: ERROR_CODES.REQUIREMENT_NOT_FOUND,
    message: 'Requisito não encontrado.',
    expose: false
  },
  Task: { code: ERROR_CODES.TASK_NOT_FOUND, message: 'Tarefa não encontrada.', expose: false },
  Sprint: { code: ERROR_CODES.SPRINT_NOT_FOUND, message: 'Sprint não encontrada.', expose: true },
  Milestone: {
    code: ERROR_CODES.MILESTONE_NOT_FOUND,
    message: 'Marco não encontrado.',
    expose: true
  }
});

// Fallback genérico para caminho não mapeado: nunca revelar mais do que o
// mapeamento conhece.
const GENERIC = Object.freeze({
  code: ERROR_CODES.RESOURCE_NOT_FOUND,
  message: 'Recurso não encontrado.',
  expose: true
});

export function resourceNotFoundError(resourceType) {
  const { code, message, expose } = NOT_FOUND_BY_RESOURCE[resourceType] || GENERIC;
  return new AppError({ message, statusCode: 404, code, exposeTechnicalDetails: expose });
}

export const NOT_FOUND_RESOURCE_TYPES = Object.freeze(Object.keys(NOT_FOUND_BY_RESOURCE));
