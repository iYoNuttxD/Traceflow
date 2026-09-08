import { asyncHandler } from '../../shared/http/index.js';
import { defectService as s } from './defect.service.js';
const context = (req) => ({ actorUserId: req.auth.user.id, requestId: req.requestId });
const handle = (fn) => asyncHandler(fn, { fallbackMessage: 'Erro ao processar defeito.' });
export const defectController = {
  candidates: handle(async (req, res) =>
    res.json(await s.candidates(req.params.projectId, req.query, context(req)))
  ),
  list: handle(async (req, res) =>
    res.json(await s.list(req.params.projectId, req.query, context(req)))
  ),
  create: handle(async (req, res) =>
    res.status(201).json({ defect: await s.create(req.params.projectId, req.body, context(req)) })
  ),
  read: handle(async (req, res) => res.json({ defect: await s.read(req.params.id, context(req)) })),
  update: handle(async (req, res) =>
    res.json({ defect: await s.update(req.params.id, req.body, context(req)) })
  ),
  delete: handle(async (req, res) => {
    await s.delete(req.params.id, context(req));
    res.status(204).end();
  }),
  history: handle(async (req, res) =>
    res.json(await s.history(req.params.id, req.query, context(req)))
  ),
  retests: handle(async (req, res) =>
    res.json(await s.retests(req.params.id, req.query, context(req)))
  ),
  correction: handle(async (req, res) =>
    res.status(201).json({ defect: await s.correction(req.params.id, req.body, context(req)) })
  )
};
