import { env } from '../../config/env.js';
import { asyncHandler } from '../../shared/http/index.js';
import { settingsService } from './settings.service.js';

const clearCookie = (res) =>
  res.clearCookie(env.sessionCookieName, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.sessionCookieSameSite,
    path: '/'
  });

export const settingsController = {
  account: asyncHandler(async (req, res) =>
    res.json({ account: await settingsService.account(req.auth.user.id) })
  ),
  profile: asyncHandler(async (req, res) =>
    res.json({
      message: 'Perfil atualizado.',
      account: await settingsService.updateProfile(req.auth.user.id, req.body.name, req.requestId)
    })
  ),
  username: asyncHandler(async (req, res) =>
    res.json({
      message: 'Username atualizado.',
      account: await settingsService.updateUsername(
        req.auth.user.id,
        req.body.username,
        req.requestId
      )
    })
  ),
  emailStatus: asyncHandler(async (req, res) =>
    res.json({ request: await settingsService.emailChangeStatus(req.auth.user.id) })
  ),
  requestEmail: asyncHandler(async (req, res) =>
    res.status(202).json({
      request: await settingsService.requestEmailChange(req.auth.user.id, req.body, req.requestId)
    })
  ),
  cancelEmail: asyncHandler(async (req, res) => {
    await settingsService.cancelEmailChange(req.auth.user.id, req.requestId);
    return res.status(204).end();
  }),
  confirmEmail: asyncHandler(async (req, res) =>
    res.json({
      message: 'E-mail alterado. Faça login novamente.',
      account: await settingsService.confirmEmailChange(req.query.token, req.requestId)
    })
  ),
  password: asyncHandler(async (req, res) => {
    await settingsService.changePassword(
      req.auth.user.id,
      req.auth.session.id,
      req.body,
      req.requestId
    );
    return res.json({ message: 'Senha alterada.' });
  }),
  sessions: asyncHandler(async (req, res) =>
    res.json({
      sessions: await settingsService.sessions(req.auth.user.id, req.auth.session.publicId)
    })
  ),
  revokeSession: asyncHandler(async (req, res) => {
    const session = await settingsService.revokeSession(
      req.auth.user.id,
      req.params.sessionId,
      req.requestId
    );
    if (session.id === req.auth.session.id) clearCookie(res);
    return res.status(204).end();
  }),
  revokeOthers: asyncHandler(async (req, res) =>
    res.json({
      revoked: await settingsService.revokeOtherSessions(
        req.auth.user.id,
        req.auth.session.id,
        req.requestId
      )
    })
  ),
  deactivate: asyncHandler(async (req, res) =>
    res.json({
      message: 'Conta desativada.',
      account: await settingsService.deactivate(
        req.auth.user.id,
        req.auth.session.id,
        req.body,
        req.requestId
      )
    })
  ),
  startReactivation: asyncHandler(async (req, res) => {
    await settingsService.startReactivation(req.auth.user.id, req.requestId);
    return res.status(202).json({ message: 'Confirmação de reativação enviada.' });
  }),
  confirmReactivation: asyncHandler(async (req, res) =>
    res.json({
      message: 'Conta reativada. Faça login novamente.',
      account: await settingsService.confirmReactivation(req.query.token, req.requestId)
    })
  ),
  deletion: asyncHandler(async (req, res) =>
    res.json({ request: await settingsService.deletion(req.auth.user.id) })
  ),
  requestDeletion: asyncHandler(async (req, res) =>
    res.status(202).json({
      request: await settingsService.requestDeletion(
        req.auth.user.id,
        req.auth.session.id,
        req.body,
        req.requestId
      )
    })
  ),
  cancelDeletion: asyncHandler(async (req, res) => {
    const result = await settingsService.cancelDeletion(req.auth.user.id, req.body, req.requestId);
    if (result.changed) clearCookie(res);
    return res.json({
      message: result.changed
        ? 'Exclusão cancelada. Faça login novamente.'
        : 'A exclusão já estava cancelada.',
      request: result.request
    });
  }),
  exportData: asyncHandler(async (req, res) => {
    const result = await settingsService.exportData(req.auth.user.id, req.requestId);
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.set('Content-Length', String(result.zip.length));
    return res.send(result.zip);
  }),
  github: asyncHandler(async (req, res) =>
    res.json({ integrations: await settingsService.githubIntegrations(req.auth.user.id) })
  ),
  removeGithub: asyncHandler(async (req, res) =>
    res.json({
      result: await settingsService.removeGithubAuthorization(
        req.auth.user.id,
        req.params.authorizationId,
        req.body,
        req.requestId
      )
    })
  )
};
