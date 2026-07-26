import { asyncHandler } from '../../shared/http/index.js';
import { projectMembershipService } from './services/project-membership.service.js';
import { auditService } from '../audit/audit.service.js';

export const projectMembershipController = {
  list: asyncHandler(async (req, res) => {
    const result = await projectMembershipService.list(req.params.projectId, req.projectMembership);
    await auditService.recordOperational({
      actorUserId: req.auth.user.id,
      projectId: req.params.projectId,
      requestId: req.requestId,
      action: 'PROJECT_MEMBERS_VIEWED',
      resourceType: 'ProjectMembership'
    });
    return res.json({ projectId: req.params.projectId, ...result });
  }),
  updateRole: asyncHandler(async (req, res) =>
    res.json({
      message: 'Papel do membro atualizado com sucesso.',
      membership: await projectMembershipService.updateRole(
        req.params.projectId,
        req.params.membershipId,
        req.body.role,
        req.auth.user.id,
        req.requestId
      )
    })
  ),
  deactivate: asyncHandler(async (req, res) => {
    await projectMembershipService.deactivate(
      req.params.projectId,
      req.params.membershipId,
      req.auth.user.id,
      req.requestId
    );
    return res.status(204).end();
  }),
  reactivate: asyncHandler(async (req, res) =>
    res.json({
      message: 'Membro reativado com sucesso.',
      membership: await projectMembershipService.reactivate(
        req.params.projectId,
        req.params.membershipId,
        req.auth.user.id,
        req.requestId
      )
    })
  ),
  leave: asyncHandler(async (req, res) => {
    await projectMembershipService.leave(req.params.projectId, req.auth.user.id, req.requestId);
    return res.status(204).end();
  }),
  transferOwnership: asyncHandler(async (req, res) =>
    res.json({
      message: 'Propriedade do projeto transferida com sucesso.',
      membership: await projectMembershipService.transferOwnership(
        req.params.projectId,
        req.body.membershipId,
        req.auth.user.id,
        req.requestId
      )
    })
  )
};
