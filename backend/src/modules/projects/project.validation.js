import { z } from 'zod';
import {
  INPUT_LIMITS,
  optionalText,
  positiveInteger,
  requiredText,
  strictObject
} from '../../shared/validation/index.js';

const projectStatus = z.enum(['ATIVO', 'INATIVO', 'ARQUIVADO'], {
  error: 'Status inválido. Use ATIVO, INATIVO ou ARQUIVADO.'
});
const optionalProjectText = (field) => optionalText({ field });
const repositoryId = z
  .union([z.string(), z.number().int()])
  .transform(String)
  .pipe(z.string().trim().min(1, 'githubRepositoryId é obrigatório.').max(INPUT_LIMITS.shortText));

export const projectIdParamsSchema = strictObject({
  id: positiveInteger('ID do projeto inválido.')
});

export const projectProjectIdParamsSchema = strictObject({
  projectId: positiveInteger('ID do projeto inválido.')
});

export const createProjectBodySchema = strictObject({
  name: requiredText({ message: 'O nome do projeto é obrigatório.' }),
  description: optionalProjectText('Descrição'),
  responsibleTeam: requiredText({ message: 'A equipe responsável é obrigatória.' }),
  status: projectStatus.optional()
});

export const updateProjectBodySchema = strictObject({
  name: requiredText({ message: 'O nome do projeto é obrigatório.' }).optional(),
  description: optionalProjectText('Descrição'),
  responsibleTeam: requiredText({ message: 'A equipe responsável é obrigatória.' }).optional(),
  status: projectStatus.optional()
});

export const createProjectFromGithubBodySchema = strictObject({
  githubInstallationId: z.string().regex(/^\d+$/, 'ID da instalação inválido.'),
  githubRepositoryId: repositoryId,
  name: optionalProjectText('Nome'),
  description: optionalProjectText('Descrição'),
  responsibleTeam: optionalProjectText('Equipe responsável')
});

export const joinProjectBodySchema = strictObject({
  accessCode: requiredText({
    field: 'Código de acesso',
    max: INPUT_LIMITS.accessCode,
    message: 'Informe o código de acesso do projeto.'
  }).transform((value) => value.toUpperCase())
});

export const joinProjectDetailsQuerySchema = joinProjectBodySchema;

export const accessCodeRoleBodySchema = strictObject({
  role: z.enum(['MEMBER', 'VIEWER'], {
    error: 'O perfil do código deve ser Membro ou Visualizador.'
  })
});

export const githubSyncSettingsBodySchema = strictObject({
  githubAutoSyncEnabled: z.boolean({ error: 'githubAutoSyncEnabled deve ser um valor booleano.' })
});
