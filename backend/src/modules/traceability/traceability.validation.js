import { TRACEABILITY_SITUATIONS } from './requirement-traceability.policy.js';
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
  requirementStatus: z
    .enum([
      'CADASTRADO',
      'APROVADO',
      'EM_IMPLEMENTACAO',
      'VALIDADO',
      'CONCLUIDO',
      'PENDENTE',
      'EM_ANDAMENTO',
      'CANCELADO'
    ])
    .optional(),
  hasTests: booleanFilter,
  hasOpenDefects: booleanFilter,
  hasTechnicalEvidence: booleanFilter
});
export const requirementHistoryQuerySchema = strictObject({
  limit: positiveInteger('Limite inválido.').pipe(z.number().max(100)).default(30),
  cursor: z.string().max(400).optional()
});
