import { logger } from '../../shared/logger/index.js';
import { asyncHandler } from '../../shared/http/index.js';
import { evidenceUploadService } from './services/evidence-upload.service.js';
const context = (req) => ({
  actorUserId: req.auth.user.id,
  sessionId: req.auth.session.id,
  requestId: req.requestId
});
const handle = (fn) =>
  asyncHandler(
    async (req, res) => {
      try {
        return await fn(req, res);
      } catch (error) {
        logger.warn('Pedido de upload recusado.', {
          event: 'upload_rejected',
          errorCode: error.code || 'UPLOAD_FAILED',
          requestId: req.requestId,
          status: error.statusCode || 500
        });
        if (error.statusCode === 429) res.setHeader('Retry-After', '3');
        throw error;
      }
    },
    { fallbackMessage: 'Não foi possível processar o upload.' }
  );
export const evidenceUploadController = {
  initiate: handle(async (req, res) =>
    res
      .status(201)
      .json(await evidenceUploadService.initiate(Number(req.params.id), req.body, context(req)))
  ),
  list: handle(async (req, res) =>
    res.json(await evidenceUploadService.list(Number(req.params.id), context(req)))
  ),
  status: handle(async (req, res) =>
    res.json(
      await evidenceUploadService.status(Number(req.params.id), req.params.uploadId, context(req))
    )
  ),
  part: handle(async (req, res) =>
    res.json(
      await evidenceUploadService.part(
        Number(req.params.id),
        req.params.uploadId,
        req.params.fileId,
        Number(req.params.index),
        req,
        {
          sha256: req.get('X-Chunk-SHA256'),
          offset: req.get('X-Chunk-Offset') === undefined ? NaN : Number(req.get('X-Chunk-Offset'))
        },
        context(req)
      )
    )
  ),
  complete: handle(async (req, res) =>
    res.json({
      execution: await evidenceUploadService.complete(
        Number(req.params.id),
        req.params.uploadId,
        req.body,
        context(req)
      )
    })
  ),
  cancel: handle(async (req, res) =>
    res.json(
      await evidenceUploadService.cancel(Number(req.params.id), req.params.uploadId, context(req))
    )
  )
};
