import { asyncHandler } from '../../shared/http/index.js';
import { projectInvitationService } from './services/project-invitation.service.js';
export const projectInvitationController = {
  create: asyncHandler(async (req, res) =>
    res
      .status(201)
      .json(
        await projectInvitationService.create(
          req.params.projectId,
          req.auth.user.id,
          req.body,
          req.requestId
        )
      )
  ),
  list: asyncHandler(async (req, res) =>
    res.json({ invitations: await projectInvitationService.list(req.params.projectId) })
  ),
  revoke: asyncHandler(async (req, res) => {
    await projectInvitationService.revoke(
      req.params.projectId,
      req.params.invitationId,
      req.auth.user.id,
      req.requestId
    );
    return res.status(204).end();
  }),
  accept: asyncHandler(async (req, res) =>
    res.json({
      message: 'Convite aceito com sucesso.',
      membership: await projectInvitationService.accept(
        req.body.token,
        req.auth.user,
        req.requestId
      )
    })
  )
};
