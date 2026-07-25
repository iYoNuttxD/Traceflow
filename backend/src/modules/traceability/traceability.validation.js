import { z } from 'zod';
import { paginationSchema, positiveInteger, strictObject } from '../../shared/validation/index.js';

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
