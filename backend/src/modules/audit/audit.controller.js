import { asyncHandler } from '../../shared/http/index.js';
import { auditService } from './audit.service.js';

export const auditController = {
  account: asyncHandler(async (req, res) => {
    const page = await auditService.listAccount(req.auth.user.id, req.query);
    await auditService.recordOperational({
      actorUserId: req.auth.user.id,
      requestId: req.requestId,
      action: 'AUDIT_EVENTS_VIEWED',
      resourceType: 'AuditEvent'
    });
    return res.json(page);
  }),
  project: asyncHandler(async (req, res) => {
    const page = await auditService.listProject(req.params.projectId, req.auth.user.id, req.query);
    await auditService.recordOperational({
      actorUserId: req.auth.user.id,
      projectId: req.params.projectId,
      requestId: req.requestId,
      action: 'AUDIT_EVENTS_VIEWED',
      resourceType: 'AuditEvent'
    });
    return res.json(page);
  })
};
