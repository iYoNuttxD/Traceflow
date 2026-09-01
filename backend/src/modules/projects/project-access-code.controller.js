import { asyncHandler } from '../../shared/http/index.js';
import { projectAccessCodeService } from './services/project-access-code.service.js';

export const projectAccessCodeController = {
  details: asyncHandler(async (req, res) =>
    res.json({ details: await projectAccessCodeService.details(req.query.accessCode) })
  ),

  configuration: asyncHandler(async (req, res) =>
    res.json({ accessCode: await projectAccessCodeService.configuration(req.params.projectId) })
  ),

  regenerate: asyncHandler(async (req, res) =>
    res.json({
      message: 'Código de acesso regenerado com sucesso.',
      accessCode: await projectAccessCodeService.regenerate(
        req.params.projectId,
        req.auth.user.id,
        req.requestId
      )
    })
  ),

  updateRole: asyncHandler(async (req, res) =>
    res.json({
      message: 'Perfil de entrada atualizado com sucesso.',
      accessCode: await projectAccessCodeService.updateRole(
        req.params.projectId,
        req.body.role,
        req.auth.user.id,
        req.requestId
      )
    })
  )
};
