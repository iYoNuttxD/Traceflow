import { z } from 'zod';
import {
  INPUT_LIMITS,
  email,
  githubUrl,
  optionalText,
  positiveInteger,
  requiredText,
  strictObject
} from '../../shared/validation/index.js';

const projectStatus = z.enum(['ATIVO', 'INATIVO', 'ARQUIVADO'], {
  error: 'Status inválido. Use ATIVO, INATIVO ou ARQUIVADO.'
});
const optionalProjectText = (field) => optionalText({ field });
const githubOwner = requiredText({ field: 'githubOwner' });
const githubRepositoryName = requiredText({ field: 'githubRepositoryName' });
const repositoryId = z.union([z.string(), z.number().int()])
  .transform(String)
  .pipe(z.string().trim().min(1, 'githubRepositoryId é obrigatório.').max(INPUT_LIMITS.shortText));

export const projectIdParamsSchema = strictObject({
  id: positiveInteger('ID do projeto inválido.')
});

export const projectProjectIdParamsSchema = strictObject({
  projectId: positiveInteger('ID do projeto inválido.')
});

const repositoryShape = {
  githubOwner: requiredText({ field: 'githubOwner' }),
  githubRepo: requiredText({ field: 'githubRepo' }),
  githubUrl
};

export const createProjectBodySchema = strictObject({
  name: requiredText({ message: 'O nome do projeto é obrigatório.' }),
  description: optionalProjectText('Descrição'),
  responsibleTeam: requiredText({ message: 'A equipe responsável é obrigatória.' }),
  status: projectStatus.optional(),
  ...repositoryShape
});

export const updateProjectBodySchema = strictObject({
  name: requiredText({ message: 'O nome do projeto é obrigatório.' }).optional(),
  description: optionalProjectText('Descrição'),
  responsibleTeam: requiredText({ message: 'A equipe responsável é obrigatória.' }).optional(),
  status: projectStatus.optional(),
  githubOwner: repositoryShape.githubOwner.optional(),
  githubRepo: repositoryShape.githubRepo.optional(),
  githubUrl: githubUrl.optional()
});

export const createProjectFromGithubBodySchema = strictObject({
  githubRepositoryId: repositoryId,
  githubOwner,
  githubRepositoryName,
  githubRepositoryFullName: requiredText({ field: 'githubRepositoryFullName' }),
  githubRepositoryUrl: githubUrl,
  githubDefaultBranch: requiredText({ field: 'githubDefaultBranch' }),
  name: optionalProjectText('Nome'),
  nome: optionalProjectText('Nome'),
  description: optionalProjectText('Descrição'),
  responsibleTeam: optionalProjectText('Equipe responsável'),
  githubAutoSyncEnabled: z.boolean({ error: 'githubAutoSyncEnabled deve ser um valor booleano.' }).optional()
});

const memberFields = {
  name: requiredText({ message: 'O nome do membro é obrigatório.' }),
  email: z.union([email, z.literal('').transform(() => null), z.null()]).optional(),
  role: optionalText({ field: 'Papel' })
};

export const addProjectMemberBodySchema = strictObject(memberFields);

export const joinProjectBodySchema = strictObject({
  accessCode: requiredText({
    field: 'Código de acesso',
    max: INPUT_LIMITS.accessCode,
    message: 'Informe o código de acesso do projeto.'
  }).transform((value) => value.toUpperCase()),
  ...memberFields
});

export const githubSyncSettingsBodySchema = strictObject({
  githubAutoSyncEnabled: z.boolean({ error: 'githubAutoSyncEnabled deve ser um valor booleano.' })
});
