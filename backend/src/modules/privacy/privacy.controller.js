import { env } from '../../config/env.js';
import { asyncHandler } from '../../shared/http/index.js';
import { privacyService } from './privacy.service.js';
import { auditService } from '../audit/audit.service.js';

const clearCookie = (res) => res.clearCookie(env.sessionCookieName, { httpOnly: true, secure: env.isProduction, sameSite: env.sessionCookieSameSite, path: '/' });

export const privacyController = {
  data: asyncHandler(async (req, res) => {
    const data = await privacyService.personalData(req.auth.user.id, req.auth.session.id);
    await auditService.recordOperational({ actorUserId: req.auth.user.id, requestId: req.requestId, action: 'PERSONAL_DATA_VIEWED', resourceType: 'User', resourceId: req.auth.user.id });
    return res.json({ data });
  }),
  profile: asyncHandler(async (req, res) => res.json({ message: 'Perfil atualizado com sucesso.', user: await privacyService.updateProfile(req.auth.user.id, req.body, req.requestId) })),
  sessions: asyncHandler(async (req, res) => res.json({ sessions: await privacyService.sessions(req.auth.user.id, req.auth.session.id) })),
  revokeSession: asyncHandler(async (req, res) => { await privacyService.revokeSession(req.auth.user.id, req.params.sessionId, req.requestId); if (req.params.sessionId === req.auth.session.id) clearCookie(res); return res.status(204).end(); }),
  revokeAllSessions: asyncHandler(async (req, res) => { await privacyService.revokeAllSessions(req.auth.user.id, req.requestId); clearCookie(res); return res.status(204).end(); }),
  requestExport: asyncHandler(async (req, res) => res.status(202).json({ export: await privacyService.requestExport(req.auth.user.id, req.requestId) })),
  exportStatus: asyncHandler(async (req, res) => res.json({ export: await privacyService.exportStatus(req.auth.user.id, req.params.exportId) })),
  downloadExport: asyncHandler(async (req, res) => {
    const payload = await privacyService.downloadExport(req.auth.user.id, req.params.exportId);
    await auditService.recordOperational({ actorUserId: req.auth.user.id, requestId: req.requestId, action: 'PERSONAL_DATA_EXPORT_DOWNLOADED', resourceType: 'PersonalDataExport', resourceId: req.params.exportId });
    res.set('Content-Disposition', `attachment; filename="traceflow-personal-data-${req.params.exportId}.json"`);
    return res.json(payload);
  }),
  deactivate: asyncHandler(async (req, res) => { await privacyService.deactivate(req.auth.user.id, req.body.password, req.requestId); clearCookie(res); return res.json({ message: 'Conta desativada com sucesso.' }); }),
  deletionRequest: asyncHandler(async (req, res) => res.json({ request: await privacyService.deletionRequest(req.auth.user.id) })),
  requestDeletion: asyncHandler(async (req, res) => res.status(202).json({ request: await privacyService.requestDeletion(req.auth.user.id, req.body.password, req.requestId) })),
  cancelDeletion: asyncHandler(async (req, res) => res.json({ message: 'Solicitação de exclusão cancelada.', request: await privacyService.cancelDeletion(req.auth.user.id, req.requestId) }))
};
