import { asyncHandler } from '../../shared/http/index.js';
import { reportService } from './report.service.js';

const context = (req) => ({ actorUserId: req.auth.user.id, requestId: req.requestId });
const handle = (fn) => asyncHandler(fn, { fallbackMessage: 'Erro ao processar relatório.' });

export const reportController = {
  create: handle(async (req, res) =>
    res.status(202).json(await reportService.request(req.params.projectId, req.body, context(req)))
  ),
  list: handle(async (req, res) =>
    res.json(await reportService.list(req.params.projectId, req.query))
  ),
  read: handle(async (req, res) =>
    res.json({ report: await reportService.read(req.params.projectId, req.params.reportId) })
  ),
  pdf: handle(async (req, res) => {
    const { buffer, filename } = await reportService.exportPdf(
      req.params.projectId,
      req.params.reportId,
      req.query,
      context(req)
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': String(buffer.length),
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    return res.send(buffer);
  })
};
