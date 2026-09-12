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
// Estimativa em horas com passo de meia hora (1, 1.5, 2...): qualquer outra fração
// não tem leitura útil no planejamento e quebraria a soma da sprint.
const isHalfHourStep = (value) =>
  Number.isFinite(value) && value >= 0 && Math.abs(value * 2 - Math.round(value * 2)) < 1e-9;
const effort = (message) =>
  z.union([
    z.number().refine(isHalfHourStep, message),
    z
      .string()
      .regex(/^\d+([.,]\d+)?$/, message)
      .transform((value) => Number(value.replace(',', '.')))
      .refine(isHalfHourStep, message),
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
    'O esforço estimado deve ser um número de horas maior ou igual a zero, em passos de meia hora (ex.: 1, 1.5, 2).'
  ).optional(),
  // Aceito na forma para que o service responda com a mensagem específica de
  // campo derivado, em vez do erro genérico de chave desconhecida.
  actualEffort: z.unknown().optional(),
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
export const taskSprintBodySchema = strictObject({
  sprintId: positiveInteger('ID da sprint inválido.')
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
export const taskCommentListQuerySchema = strictObject({
  before: z.string().trim().min(1).max(256).optional(),
  limit: paginationSchema.limit
});

export const taskTimeEntryParamsSchema = strictObject({
  id: positiveInteger('ID da tarefa inválido.'),
  entryId: positiveInteger('ID da sessão de tempo inválido.')
});
export const taskTimeEntryListQuerySchema = dateRangeSchema.extend({
  source: z
    .enum(['TIMER', 'MANUAL'], { error: 'Origem inválida. Use TIMER ou MANUAL.' })
    .optional(),
  ...paginationSchema
});
const manualHours = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim() !== '' ? Number(value.replace(',', '.')) : value,
  z
    .number({ error: 'Informe as horas do lançamento manual.' })
    .positive('As horas do lançamento devem ser maiores que zero.')
    .max(24, 'Um lançamento manual deve ter no máximo 24 horas.')
);
export const taskTimeEntryManualBodySchema = strictObject({
  hours: manualHours,
  note: optionalText({ field: 'Observação' }),
  occurredAt: z
    .union([dateOnly('Data do lançamento'), isoDateTime('Data do lançamento')])
    .optional()
});

export const taskEffortHistoryQuerySchema = taskTimeEntryListQuerySchema.extend({
  eventType: z.enum(['CREATED', 'UPDATED', 'DELETED']).optional()
});
export const taskTimeEntryUpdateBodySchema = strictObject({
  hours: manualHours,
  expectedUpdatedAt: isoDateTime('Versão da sessão')
});

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
  field: z.enum(['STATUS', 'DEADLINE', 'RESPONSIBLE', 'PRIORITY', 'SPRINT']).optional(),
  ...paginationSchema
});
