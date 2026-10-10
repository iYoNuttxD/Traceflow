import { asyncHandler } from '../../shared/http/index.js';
import { notificationService } from './notification.service.js';

const userIdOf = (req) => req.auth.user.id;

export const notificationController = {
  list: asyncHandler(
    async (req, res) => res.json(await notificationService.list(userIdOf(req), req.query)),
    { fallbackMessage: 'Erro interno ao listar notificações.' }
  ),

  unreadCount: asyncHandler(
    async (req, res) => res.json(await notificationService.unreadCount(userIdOf(req))),
    { fallbackMessage: 'Erro interno ao contar notificações não lidas.' }
  ),

  markRead: asyncHandler(
    async (req, res) =>
      res.json(
        await notificationService.markRead(userIdOf(req), req.params.notificationId, req.body.read)
      ),
    { fallbackMessage: 'Erro interno ao atualizar a notificação.' }
  ),

  markAllRead: asyncHandler(
    async (req, res) => res.json(await notificationService.markAllRead(userIdOf(req))),
    { fallbackMessage: 'Erro interno ao marcar as notificações como lidas.' }
  ),

  preferences: asyncHandler(
    async (req, res) => res.json(await notificationService.preferences(userIdOf(req))),
    { fallbackMessage: 'Erro interno ao carregar as preferências de notificação.' }
  ),

  updatePreferences: asyncHandler(
    async (req, res) =>
      res.json(
        await notificationService.updatePreferences(userIdOf(req), req.body.preferences, {
          requestId: req.requestId
        })
      ),
    { fallbackMessage: 'Erro interno ao salvar as preferências de notificação.' }
  )
};
