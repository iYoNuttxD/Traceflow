import { z } from 'zod';
import {
  dateOnly,
  dateRangeSchema,
  isoDateTime,
  optionalText,
  paginationSchema,
  positiveInteger,
  requiredText,
  searchText,
  strictObject
} from '../../shared/validation/index.js';

const taskStatus = z.enum(['A_FAZER', 'EM_ANDAMENTO', 'CONCLUIDO'], {
  error: 'Status inválido. Use A_FAZER, EM_ANDAMENTO ou CONCLUIDO.'
});
const priority = z.enum(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'], {
  error: 'Prioridade inválida. Use BAIXA, MEDIA, ALTA ou CRITICA.'
});
const nullableId = (message) => z.union([positiveInteger(message), z.null(), z.literal('')]);
const effort = (message) =>
  z.union([
    z.number().int().nonnegative(message),
    z.string().regex(/^\d+$/, message).transform(Number),
    z.null(),
    z.literal('').transform(() => null)
  ]);
const deadline = z.union([
  dateOnly('Prazo'),
  isoDateTime('Prazo'),
  z.null(),
  z.literal('').transform(() => null)
]);

export const taskProjectParamsSchema = strictObject({
  projectId: positiveInteger('ID do projeto inválido.')
});
export const taskIdParamsSchema = strictObject({
  id: positiveInteger('ID da tarefa inválido.')
});
export const taskCommitParamsSchema = strictObject({
  id: positiveInteger('ID da tarefa inválido.'),
  commitId: positiveInteger('ID do commit inválido.')
});
export const taskIssueParamsSchema = strictObject({
  id: positiveInteger('ID da tarefa inválido.'),
  issueId: positiveInteger('ID da issue inválido.')
});
export const taskCommentParamsSchema = strictObject({
  id: positiveInteger('ID da tarefa inválido.'),
  commentId: positiveInteger('ID do comentário inválido.')
});

const taskFields = {
  title: requiredText({ message: 'O título da tarefa é obrigatório.' }),
  description: optionalText({ field: 'Descrição' }),
  priority: priority.optional(),
  responsibleUserId: nullableId('ID do usuário responsável inválido.').optional(),
  deadline: deadline.optional(),
  estimatedEffort: effort(
    'O esforço estimado deve ser um número inteiro maior ou igual a zero.'
  ).optional(),
  actualEffort: effort(
    'O esforço realizado deve ser um número inteiro maior ou igual a zero.'
  ).optional(),
  requirementId: nullableId('ID do requisito inválido.').optional()
};

export const createTaskBodySchema = strictObject({
  ...taskFields
});

export const updateTaskBodySchema = strictObject({
  ...taskFields,
  title: taskFields.title.optional()
});

export const taskStatusBodySchema = strictObject({ status: taskStatus });
export const taskRequirementBodySchema = strictObject({
  requirementId: positiveInteger('ID do requisito inválido.')
});
export const pullRequestLinkBodySchema = strictObject({
  pullRequestId: nullableId('ID do pull request inválido.')
});
export const taskCommitBodySchema = strictObject({
  commitId: positiveInteger('ID do commit inválido.')
});
export const taskIssueBodySchema = strictObject({
  issueId: positiveInteger('ID da issue inválido.')
});
export const moveTaskBodySchema = strictObject({
  toStatus: taskStatus
});

export const taskCommentBodySchema = strictObject({
  content: requiredText({
    field: 'Comentário',
    max: 2000,
    message: 'O comentário não pode ser vazio.'
  })
});
export const taskCommentListQuerySchema = strictObject({ ...paginationSchema });

export const taskSearchQuerySchema = strictObject({ search: searchText });
export const taskDateRangeQuerySchema = dateRangeSchema;
export const movementQuerySchema = dateRangeSchema.extend({
  taskId: positiveInteger('ID da tarefa inválido.').optional(),
  actorUserId: positiveInteger('ID do ator inválido.').optional(),
  movedBy: optionalText({ field: 'Responsável pela movimentação' }),
  ...paginationSchema
});

export const taskHistoryQuerySchema = dateRangeSchema.extend({
  taskId: positiveInteger('ID da tarefa inválido.').optional(),
  actorUserId: positiveInteger('ID do ator inválido.').optional(),
  field: z.enum(['STATUS', 'DEADLINE', 'RESPONSIBLE', 'PRIORITY']).optional(),
  ...paginationSchema
});
