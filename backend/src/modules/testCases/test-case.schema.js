import { z } from 'zod';
import { AppError } from '../../shared/errors/index.js';

export const LIMITS = Object.freeze({
  title: 200,
  description: 10000,
  preconditions: 20000,
  expectedResult: 20000,
  action: 10000,
  stepExpectedResult: 10000,
  observedResult: 20000,
  steps: 100,
  tasks: 100
});
export const fail = (message, statusCode = 400, code = 'VALIDATION_ERROR') =>
  new AppError({ message, statusCode, code, exposeTechnicalDetails: true });
export const missing = () => fail('Recurso não encontrado.', 404, 'RESOURCE_NOT_FOUND');
const id = z.number().int().positive().max(2147483647);
const text = (max) => z.string().trim().min(1).max(max);
const nullableText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => v || null);
export const statusSchema = z.enum(['ATIVO', 'INATIVO']);
export const resultSchema = z.enum(['PASS', 'FAIL', 'BLOCKED']);
const step = z.strictObject({
  action: text(LIMITS.action),
  expectedResult: text(LIMITS.stepExpectedResult)
});
const definition = {
  title: text(LIMITS.title),
  description: nullableText(LIMITS.description).default(null),
  preconditions: text(LIMITS.preconditions),
  expectedResult: text(LIMITS.expectedResult),
  status: statusSchema.default('ATIVO'),
  responsibleUserId: id,
  requirementId: id.nullable().default(null),
  taskIds: z
    .array(id)
    .max(LIMITS.tasks)
    .refine((v) => new Set(v).size === v.length, 'Tarefas duplicadas.')
    .transform((v) => [...v].sort((a, b) => a - b))
    .default([]),
  steps: z.array(step).min(1).max(LIMITS.steps)
};
export const createSchema = z.strictObject(definition);
export const updateSchema = z.strictObject({
  ...Object.fromEntries(
    Object.entries(definition).map(([k, v]) => [
      k,
      (v instanceof z.ZodDefault ? v.removeDefault() : v).optional()
    ])
  ),
  expectedVersion: id
});
export const changeStatusSchema = z.strictObject({ status: statusSchema, expectedVersion: id });
export const executionSchema = z.strictObject({
  testCaseVersion: id,
  environment: z.enum(['LOCAL', 'DESENVOLVIMENTO', 'HOMOLOGACAO']),
  testedReference: z.strictObject({ type: z.enum(['PULL_REQUEST', 'COMMIT']), id }),
  steps: z
    .array(
      z
        .strictObject({
          position: id.max(LIMITS.steps),
          result: resultSchema,
          observedResult: nullableText(LIMITS.observedResult).default(null)
        })
        .refine(
          (v) => v.result === 'PASS' || Boolean(v.observedResult),
          'Informe o resultado observado para FAIL/BLOCKED.'
        )
    )
    .min(1)
    .max(LIMITS.steps)
});
export const paramsSchema = z.object({ id: z.coerce.number().int().positive().max(2147483647) });
export const projectParamsSchema = z.object({
  projectId: z.coerce.number().int().positive().max(2147483647)
});
const page = z.coerce.number().int().min(1).max(1000000).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(20);
const queryId = z.coerce.number().int().positive().max(2147483647).optional();
export const listSchema = z.strictObject({
  page,
  limit,
  search: z.string().trim().max(200).optional(),
  status: statusSchema.optional(),
  responsibleUserId: queryId,
  requirementId: queryId,
  taskId: queryId,
  latestResult: z.enum(['PASS', 'FAIL', 'BLOCKED', 'NEVER_EXECUTED']).optional()
});
export const versionsQuerySchema = z.strictObject({ page, limit });
export const cursorQuerySchema = z.strictObject({
  limit: limit.default(30),
  cursor: z.string().max(400).optional()
});
export const referencesQuerySchema = z.strictObject({
  search: z.string().trim().max(200).default(''),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success)
    throw fail('Dados inválidos. Verifique os campos obrigatórios e seus limites.');
  return result.data;
}
export function assertVersion(current, expected) {
  if (current.currentVersion !== expected)
    throw fail(
      'O caso de teste foi atualizado. Recarregue a versão atual.',
      409,
      'TEST_CASE_VERSION_CONFLICT'
    );
}
export function definitionSnapshot(value, requirement, tasks) {
  return {
    schemaVersion: 1,
    title: value.title,
    description: value.description ?? null,
    preconditions: value.preconditions,
    expectedResult: value.expectedResult,
    requirement: requirement ? { id: requirement.id, title: requirement.title } : null,
    tasks: tasks.map(({ id, title }) => ({ id, title })).sort((a, b) => a.id - b.id),
    steps: value.steps.map(({ action, expectedResult }, i) => ({
      position: i + 1,
      action,
      expectedResult
    }))
  };
}
export function changedDefinitionFields(current, next) {
  const keys = [
    'title',
    'description',
    'preconditions',
    'expectedResult',
    'requirementId',
    'taskIds',
    'steps'
  ];
  const normalize = (value, key) =>
    key === 'taskIds'
      ? [...value.taskIds].sort((a, b) => a - b)
      : key === 'steps'
        ? value.steps.map(({ action, expectedResult }) => ({ action, expectedResult }))
        : (value[key] ?? null);
  return keys.filter(
    (key) => JSON.stringify(normalize(current, key)) !== JSON.stringify(normalize(next, key))
  );
}
export function calculateResult(steps) {
  if (!steps.length) throw fail('É necessário registrar todos os passos.');
  return steps.some((s) => s.result === 'FAIL')
    ? 'FAIL'
    : steps.some((s) => s.result === 'BLOCKED')
      ? 'BLOCKED'
      : 'PASS';
}
export function executionSteps(snapshot, submitted) {
  const byPosition = new Map(submitted.map((s) => [s.position, s]));
  if (
    byPosition.size !== submitted.length ||
    snapshot.steps.length !== submitted.length ||
    snapshot.steps.some((s) => !byPosition.has(s.position))
  )
    throw fail('Informe cada passo da versão exatamente uma vez.');
  return snapshot.steps.map((s) => ({
    position: s.position,
    actionSnapshot: s.action,
    expectedResultSnapshot: s.expectedResult,
    result: byPosition.get(s.position).result,
    observedResult: byPosition.get(s.position).observedResult
  }));
}
export function referenceSnapshot(type, ref) {
  return type === 'PULL_REQUEST'
    ? {
        type,
        id: ref.id,
        number: ref.number,
        title: ref.title,
        state: ref.state,
        githubUrl: ref.githubUrl
      }
    : {
        type,
        id: ref.id,
        hash: ref.hash,
        shortHash: ref.hash.slice(0, 7),
        message: ref.message,
        authorName: ref.authorName,
        date: ref.date?.toISOString() ?? null,
        githubUrl: ref.githubUrl
      };
}
