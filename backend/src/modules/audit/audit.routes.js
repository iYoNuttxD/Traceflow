import { Router } from 'express';
import { validateRequest } from '../../shared/validation/index.js';
import { auditController } from './audit.controller.js';
import { auditProjectParams, auditQuery } from './audit.validation.js';

const router = Router();
router.get('/account/audit-events', validateRequest({ query: auditQuery }), auditController.account);
router.get('/projects/:projectId/audit-events', validateRequest({ params: auditProjectParams, query: auditQuery }), auditController.project);
export default router;
