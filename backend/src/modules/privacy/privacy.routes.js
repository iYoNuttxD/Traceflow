import { Router } from 'express';
import { validateRequest } from '../../shared/validation/index.js';
import { privacyController } from './privacy.controller.js';
import { exportParams, passwordBody, profileBody, sessionParams } from './privacy.validation.js';

const router = Router();
router.get('/personal-data', privacyController.data);
router.patch('/profile', validateRequest({ body: profileBody }), privacyController.profile);
router.get('/sessions', privacyController.sessions);
router.delete('/sessions', privacyController.revokeAllSessions);
router.delete(
  '/sessions/:sessionId',
  validateRequest({ params: sessionParams }),
  privacyController.revokeSession
);
router.post('/personal-data/export', privacyController.requestExport);
router.get(
  '/personal-data/export/:exportId',
  validateRequest({ params: exportParams }),
  privacyController.exportStatus
);
router.get(
  '/personal-data/export/:exportId/download',
  validateRequest({ params: exportParams }),
  privacyController.downloadExport
);
router.post('/deactivate', validateRequest({ body: passwordBody }), privacyController.deactivate);
router.get('/deletion-request', privacyController.deletionRequest);
router.post(
  '/deletion-request',
  validateRequest({ body: passwordBody }),
  privacyController.requestDeletion
);
router.delete(
  '/deletion-request',
  validateRequest({ body: passwordBody }),
  privacyController.cancelDeletion
);
export default router;
