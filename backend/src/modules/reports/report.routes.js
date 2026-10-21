import { Router } from 'express';
import { emptyObject, validateRequest } from '../../shared/validation/index.js';
import { reportController } from './report.controller.js';
import {
  createReportBodySchema,
  reportListQuerySchema,
  reportParamsSchema,
  reportPdfQuerySchema,
  reportProjectParamsSchema
} from './report.validation.js';

// Autorização pelo middleware de projeto: GET exige VIEWER; POST, MEMBER.
const router = Router();
router.post(
  '/projects/:projectId/reports',
  validateRequest({
    params: reportProjectParamsSchema,
    query: emptyObject,
    body: createReportBodySchema
  }),
  reportController.create
);
router.get(
  '/projects/:projectId/reports',
  validateRequest({ params: reportProjectParamsSchema, query: reportListQuerySchema }),
  reportController.list
);
router.get(
  '/projects/:projectId/reports/:reportId',
  validateRequest({ params: reportParamsSchema, query: emptyObject }),
  reportController.read
);
router.get(
  '/projects/:projectId/reports/:reportId/pdf',
  validateRequest({ params: reportParamsSchema, query: reportPdfQuerySchema }),
  reportController.pdf
);

export default router;
