import { z } from 'zod';
import { dateRangeSchema, positiveInteger, strictObject } from '../../shared/validation/index.js';

export const artifactProjectParamsSchema = strictObject({
  projectId: positiveInteger('ID do projeto inválido.')
});

export const artifactQuerySchema = dateRangeSchema.extend({
  type: z
    .enum(['commit', 'pull_request', 'issue'], {
      error: 'Tipo de artefato inválido.'
    })
    .optional(),
  branch: z.string().trim().min(1).max(191).optional()
});
