// Rotas do modulo de projetos. Regras de negocio ficam no service.
import { Router } from 'express';
import { validateRequest } from '../../shared/validation/index.js';
import { projectController } from './project.controller.js';
import artifactRoutes from '../artifacts/artifact.routes.js';
import {
  addProjectMemberBodySchema,
  createProjectBodySchema,
  createProjectFromGithubBodySchema,
  githubSyncSettingsBodySchema,
  joinProjectBodySchema,
  projectIdParamsSchema,
  projectProjectIdParamsSchema,
  updateProjectBodySchema
} from './project.validation.js';

const router = Router();

router.post('/from-github', validateRequest({ body: createProjectFromGithubBodySchema }), projectController.createFromGithub);
router.post('/join', validateRequest({ body: joinProjectBodySchema }), projectController.join);
router.patch(
  '/:projectId/github/sync-settings',
  validateRequest({ params: projectProjectIdParamsSchema, body: githubSyncSettingsBodySchema }),
  projectController.updateGithubSyncSettings
);
router.use('/', artifactRoutes);
router.get('/:projectId/members', validateRequest({ params: projectProjectIdParamsSchema }), projectController.listMembers);
router.post(
  '/:projectId/members',
  validateRequest({ params: projectProjectIdParamsSchema, body: addProjectMemberBodySchema }),
  projectController.addMember
);
router.post('/', validateRequest({ body: createProjectBodySchema }), projectController.create);
router.get('/', projectController.findAll);
router.get('/:id', validateRequest({ params: projectIdParamsSchema }), projectController.findById);
router.put(
  '/:id',
  validateRequest({ params: projectIdParamsSchema, body: updateProjectBodySchema }),
  projectController.update
);
router.delete('/:id', projectController.notImplemented);

export default router;
