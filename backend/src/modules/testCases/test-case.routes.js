import { Router } from 'express';
import { emptyBodySchema, validateRequest } from '../../shared/validation/index.js';
import { testCaseController as c } from './test-case.controller.js';
import {
  changeStatusSchema,
  createSchema,
  cursorQuerySchema,
  listSchema,
  paramsSchema,
  projectParamsSchema,
  referencesQuerySchema,
  updateSchema,
  versionsQuerySchema
} from './test-case.schema.js';
import { createEvidenceUpload } from './test-evidence.middleware.js';
const router = Router();
const params = validateRequest({ params: paramsSchema });
router.get(
  '/projects/:projectId/test-cases',
  validateRequest({ params: projectParamsSchema, query: listSchema }),
  c.list
);
router.post(
  '/projects/:projectId/test-cases',
  validateRequest({ params: projectParamsSchema, body: createSchema }),
  c.create
);
router.get('/test-cases/:id', params, c.read);
router.put('/test-cases/:id', params, validateRequest({ body: updateSchema }), c.update);
router.delete('/test-cases/:id', params, validateRequest({ body: emptyBodySchema }), c.delete);
router.patch(
  '/test-cases/:id/status',
  params,
  validateRequest({ body: changeStatusSchema }),
  c.update
);
router.get(
  '/test-cases/:id/versions',
  params,
  validateRequest({ query: versionsQuerySchema }),
  c.versions
);
router.get(
  '/test-cases/:id/history',
  params,
  validateRequest({ query: cursorQuerySchema }),
  c.history
);
router.get(
  '/test-cases/:id/executions',
  params,
  validateRequest({ query: cursorQuerySchema }),
  c.executions
);
router.post('/test-cases/:id/executions', params, createEvidenceUpload(), c.record);
router.get(
  '/test-cases/:id/tested-references',
  params,
  validateRequest({ query: referencesQuerySchema }),
  c.references
);
router.get('/test-executions/:id', params, c.execution);
router.get('/test-evidence/:id/content', params, c.content);
export default router;
