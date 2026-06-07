// Controller do RF06: expõe artefatos GitHub importados em formato consolidado.
import { artifactService } from './artifact.service.js';

export const artifactController = {
  async listProjectArtifacts(req, res) {
    try {
      const result = await artifactService.listProjectArtifacts(req.params.projectId, req.query);

      return res.json(result);
    } catch (error) {
      if (!error.statusCode) {
        console.error('Erro inesperado ao listar artefatos do projeto:', error);

        return res.status(500).json({
          message: 'Erro interno ao listar artefatos do projeto.'
        });
      }

      return res.status(error.statusCode).json({
        message: error.message
      });
    }
  }
};
