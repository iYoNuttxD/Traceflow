// Agregador central das rotas da API TRACEFLOW.
// TODO: Manter cada novo endpoint no modulo responsavel.
import { Router } from 'express';
import projectRoutes from '../modules/projects/project.routes.js';
import requirementRoutes from '../modules/requirements/requirement.routes.js';
import taskRoutes from '../modules/tasks/task.routes.js';
import githubRoutes from '../modules/github/github.routes.js';
import traceabilityRoutes from '../modules/traceability/traceability.routes.js';

const routes = Router();

routes.use('/projects', projectRoutes);
routes.use('/', requirementRoutes);
routes.use('/', taskRoutes);
routes.use('/', githubRoutes);
routes.use('/', traceabilityRoutes);

export default routes;
