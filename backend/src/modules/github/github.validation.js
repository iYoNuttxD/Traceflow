import { positiveInteger, searchText, strictObject } from '../../shared/validation/index.js';

export const githubProjectParamsSchema = strictObject({
  projectId: positiveInteger('ID do projeto inválido.')
});

export const githubSearchQuerySchema = strictObject({ search: searchText });
