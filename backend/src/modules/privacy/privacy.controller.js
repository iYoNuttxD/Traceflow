import { env } from '../../config/env.js';
import { asyncHandler } from '../../shared/http/index.js';
import { privacyService } from './privacy.service.js';
import { auditService } from '../audit/audit.service.js';
import { settingsService } from '../settings/settings.service.js';

const clearCookie = (res) =>
  res.clearCookie(env.sessionCookieName, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.sessionCookieSameSite,
    path: '/'
  });

export const privacyController = {
  data: asyncHandler(async (req, res) => {
    const data = await privacyService.personalData(req.auth.user.id, req.auth.session.id);
    await auditService.recordOperational({
      actorUserId: req.auth.user.id,
      requestId: req.requestId,
      action: 'PERSONAL_DATA_VIEWED',
      resourceType: 'User',
      resourceId: req.auth.user.id
    });
    return res.json({ data });
  }),
  profile: asyncHandler(async (req, res) =>
    res.json({
      message: 'Perfil atualizado com sucesso.',
      user: await privacyService.updateProfile(req.auth.user.id, req.body, req.requestId)
    })
  ),
  sessions: asyncHandler(async (req, res) =>
    res.json({ sessions: await privacyService.sessions(req.auth.user.id, req.auth.session.id) })
  ),
  revokeSession: asyncHandler(async (req, res) => {
    await privacyService.revokeSession(req.auth.user.id, req.params.sessionId, req.requestId);
    if (req.params.sessionId === req.auth.session.publicId) clearCookie(res);
    return res.status(204).end();
  }),
  revokeAllSessions: asyncHandler(async (req, res) => {
    await privacyService.revokeAllSessions(req.auth.user.id, req.requestId);
    clearCookie(res);
    return res.status(204).end();
  }),
  requestExport: asyncHandler(async (req, res) =>
    res
      .status(202)
      .json({ export: await privacyService.requestExport(req.auth.user.id, req.requestId) })
  ),
  exportStatus: asyncHandler(async (req, res) =>
    res.json({ export: await privacyService.exportStatus(req.auth.user.id, req.params.exportId) })
  ),
  downloadExport: asyncHandler(async (req, res) => {
    await privacyService.downloadExport(req.auth.user.id, req.params.exportId);
    const payload = await settingsService.buildExportArchive(req.auth.user.id);
    await auditService.recordOperational({
      actorUserId: req.auth.user.id,
      requestId: req.requestId,
      action: 'PERSONAL_DATA_EXPORT_DOWNLOADED',
      resourceType: 'PersonalDataExport',
      resourceId: req.params.exportId
    });
    res.set('Content-Disposition', `attachment; filename="${payload.filename}"`);
    res.type('application/zip');
    return res.send(payload.zip);
  }),
  deactivate: asyncHandler(async (req, res) => {
    const account = await settingsService.deactivate(
      req.auth.user.id,
      req.auth.session.id,
      { currentPassword: req.body.password, confirmation: true },
      req.requestId
    );
    return res.json({ message: 'Conta desativada com sucesso.', account });
  }),
  deletionRequest: asyncHandler(async (req, res) =>
    res.json({ request: await privacyService.deletionRequest(req.auth.user.id) })
  ),
  requestDeletion: asyncHandler(async (req, res) =>
    res.status(202).json({
      request: await settingsService.requestDeletion(
        req.auth.user.id,
        req.auth.session.id,
        { currentPassword: req.body.password, confirmation: true },
        req.requestId
      )
    })
  ),
  cancelDeletion: asyncHandler(async (req, res) => {
    const result = await settingsService.cancelDeletion(
      req.auth.user.id,
      { currentPassword: req.body.password, confirmation: true },
      req.requestId
    );
    if (result.changed) clearCookie(res);
    return res.json({
      message: 'Solicitação de exclusão cancelada.',
      request: result.request
    });
  })
};
