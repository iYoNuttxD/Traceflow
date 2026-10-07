import {
  REQUIREMENT_LIFECYCLE_STATUSES,
  TRACEABILITY_SITUATIONS
} from './requirement-traceability.policy.js';
import {
  TRACEABILITY_ALERT_STATUSES,
  TRACEABILITY_ALERT_TYPES
} from './traceability-alert.policy.js';
import { z } from 'zod';
import {
  emptyBodySchema,
  paginationSchema,
  positiveInteger,
  strictObject
} from '../../shared/validation/index.js';

export const traceabilityProjectParamsSchema = strictObject({
  projectId: positiveInteger('ID do projeto inválido.')
});

export const traceabilityRequirementParamsSchema = strictObject({
  projectId: positiveInteger('ID do projeto inválido.'),
  requirementId: positiveInteger('ID do requisito inválido.')
});

export const traceabilityTaskParamsSchema = strictObject({
  projectId: positiveInteger('ID do projeto inválido.'),
  taskId: positiveInteger('ID da tarefa inválido.')
});

export const traceabilityArtifactParamsSchema = strictObject({
  projectId: positiveInteger('ID do projeto inválido.'),
  artifactType: z.enum(['commit', 'pull-request', 'issue'], {
    error: 'Tipo de artefato inválido. Use commit, pull-request ou issue.'
  }),
  artifactId: positiveInteger('ID do artefato inválido.')
});

export const traceabilityPaginationQuerySchema = strictObject(paginationSchema);

export const commitSuggestionParamsSchema = strictObject({
  projectId: positiveInteger('ID do projeto inválido.'),
  suggestionId: positiveInteger('ID da sugestão inválido.')
});

export const commitSuggestionQuerySchema = strictObject({
  status: z
    .enum(['PENDING', 'CONFIRMED', 'REJECTED'], {
      error: 'Status de sugestão inválido.'
    })
    .optional()
    .default('PENDING'),
  taskId: positiveInteger('ID da tarefa inválido.').optional(),
  ...paginationSchema
});

export const emptyCommitSuggestionBodySchema = emptyBodySchema;

const booleanFilter = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();
export const requirementProjectionQuerySchema = strictObject({
  ...paginationSchema,
  search: z.string().trim().max(200).optional(),
  situation: z.enum(TRACEABILITY_SITUATIONS).optional(),
  requirementStatus: z.enum(REQUIREMENT_LIFECYCLE_STATUSES).optional(),
  hasTests: booleanFilter,
  hasOpenDefects: booleanFilter,
  hasTechnicalEvidence: booleanFilter
});
export const requirementHistoryQuerySchema = strictObject({
  limit: positiveInteger('Limite inválido.').pipe(z.number().max(100)).default(30),
  cursor: z.string().max(400).optional()
});

export const expandedGraphQuerySchema = strictObject({
  ...paginationSchema,
  expanded: z.enum(['true', 'false']).optional()
});

export const traceabilityAlertParamsSchema = strictObject({
  projectId: positiveInteger('ID do projeto inválido.'),
  alertId: positiveInteger('ID do alerta inválido.')
});

export const traceabilityAlertQuerySchema = strictObject({
  status: z
    .enum(TRACEABILITY_ALERT_STATUSES, { error: 'Situação de alerta inválida.' })
    .optional()
    .default('OPEN'),
  type: z.enum(TRACEABILITY_ALERT_TYPES, { error: 'Tipo de alerta inválido.' }).optional(),
  ...paginationSchema
});

const dismissalReasonMessage = 'A justificativa deve ter entre 10 e 500 caracteres.';
export const traceabilityAlertDismissBodySchema = strictObject({
  reason: z
    .string({ error: dismissalReasonMessage })
    .trim()
    .min(10, dismissalReasonMessage)
    .max(500, dismissalReasonMessage)
});

export const unlinkedTasksQuerySchema = strictObject({
  status: z
    .enum(['A_FAZER', 'EM_ANDAMENTO', 'CONCLUIDO'], { error: 'Status de tarefa inválido.' })
    .optional(),
  ...paginationSchema
});
