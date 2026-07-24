import { positiveInteger, strictObject } from '../../shared/validation/index.js';

export const traceabilityProjectParamsSchema = strictObject({
  projectId: positiveInteger('ID do projeto inválido.')
});

export const traceabilityRequirementParamsSchema = strictObject({
  projectId: positiveInteger('ID do projeto inválido.'),
  requirementId: positiveInteger('ID do requisito inválido.')
});
