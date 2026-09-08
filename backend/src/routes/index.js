// Agregador central das rotas da API TRACEFLOW; cada endpoint pertence ao módulo responsável.
import { defectRoutes } from '../modules/defects/index.js';
import { testCaseRoutes } from '../modules/testCases/index.js';
import { Router } from 'express';
import { projectRoutes } from '../modules/projects/index.js';
import { requirementRoutes } from '../modules/requirements/index.js';
import { taskRoutes } from '../modules/tasks/index.js';
import { sprintRoutes } from '../modules/sprints/index.js';
import { githubRoutes } from '../modules/github/index.js';
import { traceabilityRoutes } from '../modules/traceability/index.js';
import { auditRoutes } from '../modules/audit/index.js';
import { settingsRoutes } from '../modules/settings/index.js';

const routes = Router();

routes.use('/', testCaseRoutes);
routes.use('/', defectRoutes);
routes.use('/projects', projectRoutes);
routes.use('/', requirementRoutes);
routes.use('/', taskRoutes);
routes.use('/', sprintRoutes);
routes.use('/', githubRoutes);
routes.use('/', traceabilityRoutes);
routes.use('/', auditRoutes);
routes.use('/', settingsRoutes);

export default routes;
