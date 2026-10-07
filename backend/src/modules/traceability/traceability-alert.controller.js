import { asyncHandler } from '../../shared/http/index.js';
import { traceabilityAlertService } from './traceability-alert.service.js';

const context = (req) => ({
  actorUserId: req.auth.user.id,
  requestId: req.requestId,
  role: req.projectMembership?.role
});

export const traceabilityAlertController = {
  list: asyncHandler(
    async (req, res) =>
      res.json(await traceabilityAlertService.list(req.params.projectId, req.query, context(req))),
    { fallbackMessage: 'Erro interno ao listar alertas de rastreabilidade.' }
  ),

  summary: asyncHandler(
    async (req, res) =>
      res.json(await traceabilityAlertService.summary(req.params.projectId, context(req))),
    { fallbackMessage: 'Erro interno ao resumir alertas de rastreabilidade.' }
  ),

  get: asyncHandler(
    async (req, res) =>
      res.json(
        await traceabilityAlertService.get(req.params.projectId, req.params.alertId, context(req))
      ),
    { fallbackMessage: 'Erro interno ao carregar o alerta de rastreabilidade.' }
  ),

  dismiss: asyncHandler(
    async (req, res) =>
      res.json(
        await traceabilityAlertService.dismiss(
          req.params.projectId,
          req.params.alertId,
          req.body,
          context(req)
        )
      ),
    { fallbackMessage: 'Erro interno ao dispensar o alerta de rastreabilidade.' }
  ),

  reconcile: asyncHandler(
    async (req, res) =>
      res.json(
        await traceabilityAlertService.reconcileManually(req.params.projectId, context(req))
      ),
    { fallbackMessage: 'Erro interno ao reprocessar alertas de rastreabilidade.' }
  ),

  listUnlinkedTasks: asyncHandler(
    async (req, res) =>
      res.json(await traceabilityAlertService.listUnlinkedTasks(req.params.projectId, req.query)),
    { fallbackMessage: 'Erro interno ao listar tarefas sem vínculo técnico.' }
  )
};
