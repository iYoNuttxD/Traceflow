import { createTaskBodySchema } from '../tasks/task.validation.js';
import { z } from 'zod';
import { AppError } from '../../shared/errors/index.js';
export const fail = (message, code = 'VALIDATION_ERROR', statusCode = 400) =>
  new AppError({ message, code, statusCode, exposeTechnicalDetails: true });
export const missing = () => fail('Recurso não encontrado.', 'RESOURCE_NOT_FOUND', 404);
export const conflict = () =>
  fail('O defeito foi alterado. Recarregue o contexto.', 'DEFECT_CONFLICT', 409);
const id = z.number().int().positive().max(2147483647);
const text = (max) => z.string().trim().min(1).max(max);
const ids = z
  .array(id)
  .max(100)
  .refine((v) => new Set(v).size === v.length)
  .transform((v) => [...v].sort((a, b) => a - b));
export const severity = z.enum(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']);
export const status = z.enum(['ABERTO', 'EM_CORRECAO', 'AGUARDANDO_RETESTE', 'VALIDADO']);
const fields = {
  title: text(200),
  description: text(10000),
  severity,
  responsibleUserId: id,
  requirementId: id.nullable(),
  originTaskIds: ids
};
export const createSchema = z.strictObject({
  ...fields,
  requirementId: id.nullable().default(null),
  originTaskIds: ids.default([]),
  detectedExecutionStepId: id
});
export const updateSchema = z.strictObject({
  ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.optional()])),
  expectedRevision: id
});
export const retestSchema = z.strictObject({
  defectId: id,
  correctionCycle: id,
  expectedRevision: id
});
export const correctionSchema = z
  .strictObject({
    expectedRevision: id,
    correctionCycle: id,
    taskId: id.optional(),
    task: createTaskBodySchema.optional()
  })
  .refine((v) => Boolean(v.taskId) !== Boolean(v.task));
const queryId = z.coerce.number().int().positive().max(2147483647).optional();
const paging = {
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
};
export const pageSchema = z.strictObject(paging);
export const candidateSchema = z.strictObject({
  ...paging,
  search: z.string().trim().max(200).default('')
});
export const listSchema = z.strictObject({
  ...paging,
  search: z.string().trim().max(200).default(''),
  status: status.optional(),
  severity: severity.optional(),
  responsibleUserId: queryId,
  requirementId: queryId,
  originTaskId: queryId,
  correctionTaskId: queryId,
  testCaseId: queryId
});
export const paramsSchema = z.object({ id: z.coerce.number().int().positive().max(2147483647) });
export const projectParamsSchema = z.object({
  projectId: z.coerce.number().int().positive().max(2147483647)
});
export function parse(schema, input) {
  const r = schema.safeParse(input);
  if (!r.success) throw fail('Dados inválidos. Verifique os campos obrigatórios e seus limites.');
  return r.data;
}
export function requireTraceability(requirementId, taskIds) {
  if (!requirementId && !taskIds.length)
    throw fail('Informe um requisito ou uma tarefa de origem.', 'DEFECT_TRACEABILITY_REQUIRED');
}
export function correctionProjection(tasks, validatedByExecutionId = null) {
  const reason = {
    correctionTasksTotal: tasks.length,
    todo: 0,
    inProgress: 0,
    done: 0,
    validatedByExecutionId
  };
  for (const task of tasks) {
    if (task.status === 'A_FAZER') reason.todo++;
    else if (task.status === 'CONCLUIDO') reason.done++;
    else reason.inProgress++;
  }
  const status = validatedByExecutionId
    ? 'VALIDADO'
    : !tasks.length || reason.todo === tasks.length
      ? 'ABERTO'
      : reason.done === tasks.length
        ? 'AGUARDANDO_RETESTE'
        : 'EM_CORRECAO';
  return { status, statusReason: reason };
}
