import { Router } from 'express';
import { emptyBodySchema, validateRequest } from '../../shared/validation/index.js';
import { defectController as c } from './defect.controller.js';
import {
  projectParamsSchema,
  paramsSchema,
  listSchema,
  candidateSchema,
  pageSchema,
  createSchema,
  updateSchema,
  correctionSchema
} from './defect.schema.js';
const router = Router();
const params = validateRequest({ params: paramsSchema });
router.get(
  '/projects/:projectId/defects/detection-candidates',
  validateRequest({ params: projectParamsSchema, query: candidateSchema }),
  c.candidates
);
router.get(
  '/projects/:projectId/defects',
  validateRequest({ params: projectParamsSchema, query: listSchema }),
  c.list
);
router.post(
  '/projects/:projectId/defects',
  validateRequest({ params: projectParamsSchema, body: createSchema }),
  c.create
);
router.get('/defects/:id', params, c.read);
router.put('/defects/:id', params, validateRequest({ body: updateSchema }), c.update);
router.delete('/defects/:id', params, validateRequest({ body: emptyBodySchema }), c.delete);
router.get('/defects/:id/history', params, validateRequest({ query: pageSchema }), c.history);
router.get('/defects/:id/retests', params, validateRequest({ query: pageSchema }), c.retests);
router.post(
  '/defects/:id/correction-tasks',
  params,
  validateRequest({ body: correctionSchema }),
  c.correction
);
export default router;
