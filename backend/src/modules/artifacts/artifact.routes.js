// Rotas do RF06 para exibição de artefatos importados do GitHub.
import { Router } from 'express';
import { artifactController } from './artifact.controller.js';

const router = Router();

router.get('/:projectId/artifacts', artifactController.listProjectArtifacts);

export default router;
