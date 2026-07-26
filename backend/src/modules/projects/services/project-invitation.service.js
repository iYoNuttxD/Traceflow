import { createHash, randomBytes } from 'node:crypto';
import { env } from '../../../config/env.js';
import { AppError, ERROR_CODES } from '../../../shared/errors/index.js';
import { projectInvitationRepository } from '../project-invitation.repository.js';
import { emailService } from '../../../shared/email/index.js';
import { logger } from '../../../shared/logger/index.js';
import { auditService } from '../../audit/audit.service.js';

const tokenHash = (value) => createHash('sha256').update(value).digest('hex');
const invalidInvitation = () =>
  new AppError({
    message: 'Convite inválido ou expirado.',
    statusCode: 400,
    code: ERROR_CODES.INVITATION_INVALID,
    exposeTechnicalDetails: true
  });

export const projectInvitationService = {
  async create(projectId, creatorId, { email, role }, requestId) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + env.invitationTtlMs);
    const invitation = await projectInvitationRepository.createReplacingActive({
      projectId,
      createdById: creatorId,
      email: email.trim().toLowerCase(),
      role,
      tokenHash: tokenHash(token),
      expiresAt
    });
    await emailService.sendProjectInvitation({
      to: invitation.email,
      token,
      expiresAt,
      projectName: invitation.project.name,
      role,
      projectId,
      invitationId: invitation.id
    });
    logger.info('Convite de projeto criado.', {
      event: 'project_invitation_created',
      projectId,
      invitationId: invitation.id,
      actorId: creatorId
    });
    await auditService.recordOperational({
      actorUserId: creatorId,
      projectId,
      requestId,
      action: 'PROJECT_INVITATION_CREATED',
      resourceType: 'ProjectInvitation',
      resourceId: invitation.id
    });
    return {
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt
      },
      ...(env.isTest ? { token } : {})
    };
  },
  list(projectId) {
    return projectInvitationRepository.list(projectId);
  },
  async revoke(projectId, invitationId, actorUserId, requestId) {
    if (!(await projectInvitationRepository.revoke(projectId, invitationId)).count)
      throw invalidInvitation();
    logger.info('Convite de projeto revogado.', {
      event: 'project_invitation_revoked',
      projectId,
      invitationId
    });
    await auditService.recordOperational({
      actorUserId,
      projectId,
      requestId,
      action: 'PROJECT_INVITATION_REVOKED',
      resourceType: 'ProjectInvitation',
      resourceId: invitationId
    });
  },
  async accept(token, user, requestId) {
    const invitation = await projectInvitationRepository.findByHash(tokenHash(token));
    if (
      !invitation ||
      invitation.revokedAt ||
      invitation.acceptedAt ||
      invitation.expiresAt <= new Date() ||
      invitation.email !== user.email
    )
      throw invalidInvitation();
    const membership = await projectInvitationRepository.accept(invitation, user.id);
    logger.info('Convite de projeto aceito.', {
      event: 'project_invitation_accepted',
      projectId: invitation.projectId,
      invitationId: invitation.id,
      actorId: user.id
    });
    await auditService.recordOperational({
      actorUserId: user.id,
      projectId: invitation.projectId,
      requestId,
      action: 'PROJECT_INVITATION_ACCEPTED',
      resourceType: 'ProjectInvitation',
      resourceId: invitation.id
    });
    return membership;
  }
};
