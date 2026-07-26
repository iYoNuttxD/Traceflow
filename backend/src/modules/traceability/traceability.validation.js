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
