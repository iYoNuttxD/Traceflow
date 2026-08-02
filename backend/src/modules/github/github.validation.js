import { z } from 'zod';
import { positiveInteger, searchText, strictObject } from '../../shared/validation/index.js';

export const githubProjectParamsSchema = strictObject({
  projectId: positiveInteger('ID do projeto inválido.')
});

export const githubSearchQuerySchema = strictObject({ search: searchText });
export const githubAppStartBodySchema = strictObject({
  intendedAction: z.enum(['CONNECT_PROJECT', 'CREATE_PROJECT']),
  projectId: positiveInteger('ID do projeto inválido.').optional()
});
export const githubInstallationParamsSchema = strictObject({
  installationId: z.string().regex(/^\d+$/, 'ID da instalação inválido.')
});
export const githubRepositoryListQuerySchema = strictObject({
  projectId: positiveInteger('ID do projeto inválido.').optional()
});
export const githubConnectParamsSchema = strictObject({
  projectId: positiveInteger('ID do projeto inválido.')
});
export const githubConnectBodySchema = strictObject({
  githubInstallationId: z.string().regex(/^\d+$/, 'ID da instalação inválido.'),
  githubRepositoryId: z
    .union([z.string(), z.number().int()])
    .transform(String)
    .pipe(z.string().regex(/^\d+$/))
});
