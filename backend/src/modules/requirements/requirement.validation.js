import { z } from 'zod';
import {
  optionalText,
  positiveInteger,
  requiredText,
  searchText,
  strictObject
} from '../../shared/validation/index.js';

const requirementType = z.string().trim().transform((value) => value.toUpperCase()).pipe(
  z.enum(['FUNCIONAL', 'NAO_FUNCIONAL', 'REGRA_NEGOCIO'], {
    error: 'Tipo inválido. Use FUNCIONAL, NAO_FUNCIONAL ou REGRA_NEGOCIO.'
  })
);

const requirementStatus = z.string().trim().transform((value) => value.toUpperCase()).pipe(
  z.enum([
    'CADASTRADO', 'APROVADO', 'EM_IMPLEMENTACAO', 'VALIDADO',
    'CONCLUIDO', 'PENDENTE', 'EM_ANDAMENTO', 'CANCELADO'
  ], {
    error: 'Status inválido. Use CADASTRADO, APROVADO, EM_IMPLEMENTACAO, VALIDADO ou CONCLUIDO.'
  })
);

export const requirementProjectParamsSchema = strictObject({
  projectId: positiveInteger('ID do projeto inválido.')
});

export const requirementIdParamsSchema = strictObject({
  id: positiveInteger('ID do requisito inválido.')
});

export const createRequirementBodySchema = strictObject({
  title: requiredText({ message: 'O título do requisito é obrigatório.' }),
  description: optionalText({ field: 'Descrição' }),
  type: requirementType.optional()
});

export const updateRequirementBodySchema = strictObject({
  title: requiredText({ message: 'O título do requisito é obrigatório.' }).optional(),
  description: optionalText({ field: 'Descrição' }),
  type: requirementType.optional()
});

export const requirementStatusBodySchema = strictObject({ status: requirementStatus });
export const requirementSearchQuerySchema = strictObject({ search: searchText });
