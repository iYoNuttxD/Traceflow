import { pipeline } from 'node:stream/promises';
import { asyncHandler } from '../../shared/http/index.js';
import { testCaseService } from './services/test-case.service.js';
import { testExecutionService } from './services/test-execution.service.js';
const context = (req) => ({ actorUserId: req.auth.user.id, requestId: req.requestId });
const handle = (fn) => asyncHandler(fn, { fallbackMessage: 'Erro ao processar caso de teste.' });
export const testCaseController = {
  create: handle(async (req, res) =>
    res.status(201).json({
      testCase: await testCaseService.create(req.params.projectId, req.body, context(req))
    })
  ),
  list: handle(async (req, res) =>
    res.json(await testCaseService.list(req.params.projectId, req.query, context(req)))
  ),
  read: handle(async (req, res) =>
    res.json({ testCase: await testCaseService.read(req.params.id, context(req)) })
  ),
  update: handle(async (req, res) =>
    res.json({ testCase: await testCaseService.update(req.params.id, req.body, context(req)) })
  ),
  delete: handle(async (req, res) => {
    await testCaseService.delete(req.params.id, context(req));
    res.status(204).end();
  }),
  versions: handle(async (req, res) =>
    res.json(await testCaseService.versions(req.params.id, req.query, context(req)))
  ),
  history: handle(async (req, res) =>
    res.json(await testCaseService.history(req.params.id, req.query, context(req)))
  ),
  executions: handle(async (req, res) =>
    res.json(await testExecutionService.list(req.params.id, req.query, context(req)))
  ),
  record: handle(async (req, res) =>
    res.status(201).json({
      execution: await testExecutionService.record(
        req.params.id,
        req.body,
        req.evidenceAttempt,
        context(req)
      )
    })
  ),
  execution: handle(async (req, res) =>
    res.json({ execution: await testExecutionService.detail(req.params.id, context(req)) })
  ),
  references: handle(async (req, res) =>
    res.json(await testExecutionService.references(req.params.id, req.query, context(req)))
  ),
  content: handle(async (req, res) => {
    const file = await testExecutionService.content(req.params.id, context(req));
    const encoded = encodeURIComponent(file.originalName).replace(
      /[!'()*]/g,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
    );
    res.set({
      'Content-Type': file.mimeType,
      'Content-Length': String(file.sizeBytes),
      'Content-Disposition': `attachment; filename="evidence"; filename*=UTF-8''${encoded}`,
      'X-Content-Type-Options': 'nosniff'
    });
    try {
      await pipeline(file.stream, res);
    } catch {
      res.destroy();
    }
  })
};
