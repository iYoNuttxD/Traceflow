// Rotas do RF06 para exibição de artefatos importados do GitHub.
import { Router } from 'express';
import { validateRequest } from '../../shared/validation/index.js';
import { artifactController } from './artifact.controller.js';
import { artifactProjectParamsSchema, artifactQuerySchema } from './artifact.validation.js';

const router = Router();

router.get(
  '/:projectId/artifacts',
  validateRequest({ params: artifactProjectParamsSchema, query: artifactQuerySchema }),
  artifactController.listProjectArtifacts
);

export default router;
