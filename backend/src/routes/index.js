// Agregador central das rotas da API TRACEFLOW.
// TODO: Manter cada novo endpoint no modulo responsavel.
import { Router } from 'express';
import { projectRoutes } from '../modules/projects/index.js';
import { requirementRoutes } from '../modules/requirements/index.js';
import { taskRoutes } from '../modules/tasks/index.js';
import { githubRoutes } from '../modules/github/index.js';
import { traceabilityRoutes } from '../modules/traceability/index.js';
import { auditRoutes } from '../modules/audit/index.js';
import { privacyRoutes } from '../modules/privacy/index.js';

const routes = Router();

routes.use('/projects', projectRoutes);
routes.use('/', requirementRoutes);
routes.use('/', taskRoutes);
routes.use('/', githubRoutes);
routes.use('/', traceabilityRoutes);
routes.use('/', auditRoutes);
routes.use('/account', privacyRoutes);

export default routes;
