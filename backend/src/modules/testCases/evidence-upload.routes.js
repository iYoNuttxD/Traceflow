import { Router, json } from 'express';
import { rateLimit } from 'express-rate-limit';
import { evidenceUploadController as controller } from './evidence-upload.controller.js';
import { PAYLOAD_BYTES } from './uploads/upload-contract.js';
import { fail } from './test-case.schema.js';
const router = Router();
const base = '/test-cases/:id/execution-uploads';
const rate = rateLimit({
  windowMs: 60000,
  limit: 120,
  keyGenerator: (req) => String(req.auth.user.id),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    code: 'UPLOAD_RATE_LIMITED',
    message: 'Muitos pedidos de upload. Aguarde e tente novamente.'
  }
});
router.use(
  base,
  (req, res, next) => {
    if (!/^[1-9]\d*$/.test(req.params.id) || !Number.isSafeInteger(Number(req.params.id)))
      return next(fail('Caso inválido.'));
    next();
  },
  rate
);
router.get(base, controller.list);
router.post(base, controller.initiate);
router.get(`${base}/:uploadId`, controller.status);
router.delete(`${base}/:uploadId`, controller.cancel);
router.put(
  `${base}/:uploadId/files/:fileId/parts/:index`,
  (req, res, next) => {
    if (!req.is('application/octet-stream'))
      return next(fail('Envie conteúdo binário.', 415, 'UNSUPPORTED_MEDIA_TYPE'));
    if (!/^(0|[1-9]\d*)$/.test(req.params.index)) return next(fail('Índice inválido.'));
    next();
  },
  controller.part
);
router.post(
  `${base}/:uploadId/complete`,
  json({ limit: PAYLOAD_BYTES, strict: true }),
  controller.complete
);
export default router;
