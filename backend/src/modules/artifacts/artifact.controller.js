import { asyncHandler } from '../../shared/http/index.js';
import { artifactService } from './artifact.service.js';

export const artifactController = {
  listProjectArtifacts: asyncHandler(
    async (req, res) => {
      const result = await artifactService.listProjectArtifacts(req.params.projectId, req.query);
      return res.json(result);
    },
    { fallbackMessage: 'Erro interno ao listar artefatos do projeto.' }
  )
};
