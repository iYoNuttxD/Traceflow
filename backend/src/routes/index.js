// Agregador central das rotas da API TRACEFLOW; cada endpoint pertence ao módulo responsável.
import { Router } from 'express';
import { projectRoutes } from '../modules/projects/index.js';
import { requirementRoutes } from '../modules/requirements/index.js';
import { taskRoutes } from '../modules/tasks/index.js';
import { githubRoutes } from '../modules/github/index.js';
import { traceabilityRoutes } from '../modules/traceability/index.js';
import { auditRoutes } from '../modules/audit/index.js';
import { privacyRoutes } from '../modules/privacy/index.js';
import { settingsRoutes } from '../modules/settings/index.js';

const routes = Router();

routes.use('/projects', projectRoutes);
routes.use('/', requirementRoutes);
routes.use('/', taskRoutes);
routes.use('/', githubRoutes);
routes.use('/', traceabilityRoutes);
routes.use('/', auditRoutes);
routes.use('/account', privacyRoutes);
routes.use('/', settingsRoutes);

export default routes;
