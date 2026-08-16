import { createHash, randomBytes } from 'node:crypto';
import { env } from '../../../config/env.js';
import { AppError, ERROR_CODES } from '../../../shared/errors/index.js';
import { projectInvitationRepository } from '../project-invitation.repository.js';
import { emailService } from '../../../shared/email/index.js';
import { logger } from '../../../shared/logger/index.js';
import { auditService } from '../../audit/audit.service.js';
import { normalizeEmail } from '../../../shared/identity/index.js';

const tokenHash = (value) => createHash('sha256').update(value).digest('hex');

const invitationErrors = Object.freeze({
  EXPIRED: {
    message: 'Este convite expirou.',
    statusCode: 410,
    code: ERROR_CODES.INVITATION_EXPIRED
  },
  REVOKED: {
    message: 'Este convite foi revogado.',
    statusCode: 409,
    code: ERROR_CODES.INVITATION_REVOKED
  },
  ACCEPTED: {
    message: 'Este convite já foi utilizado.',
    statusCode: 409,
    code: ERROR_CODES.INVITATION_ALREADY_USED
  },
  DECLINED: {
    message: 'Este convite já foi recusado.',
    statusCode: 409,
    code: ERROR_CODES.INVITATION_DECLINED
  }
});

function invitationState(invitation, now = new Date()) {
  if (invitation.acceptedAt) return 'ACCEPTED';
  if (invitation.declinedAt) return 'DECLINED';
  if (invitation.revokedAt) return 'REVOKED';
  if (invitation.expiresAt <= now) return 'EXPIRED';
  return 'PENDING';
}

function invalidInvitation() {
  return new AppError({
    message: 'Convite inválido.',
    statusCode: 400,
    code: ERROR_CODES.INVITATION_INVALID,
    exposeTechnicalDetails: true
  });
}

function invitationNotFound() {
  return new AppError({
    message: 'Recurso não encontrado.',
    statusCode: 404,
    code: ERROR_CODES.RESOURCE_NOT_FOUND,
    exposeTechnicalDetails: true
  });
}

function stateError(state) {
  const details = invitationErrors[state];
  return details ? new AppError({ ...details, exposeTechnicalDetails: true }) : invalidInvitation();
}

function alreadyMember() {
  return new AppError({
    message: 'Esta pessoa já é membro ativo do projeto.',
    statusCode: 409,
    code: ERROR_CODES.PROJECT_MEMBER_ALREADY_EXISTS,
    exposeTechnicalDetails: true
  });
}

function alreadyPending() {
  return new AppError({
    message: 'Já existe um convite pendente para esta pessoa neste projeto.',
    statusCode: 409,
    code: ERROR_CODES.INVITATION_ALREADY_PENDING,
    exposeTechnicalDetails: true
  });
}

function assertRecipient(invitation, user) {
  if (!invitation || normalizeEmail(invitation.email) !== normalizeEmail(user.email)) {
    throw invalidInvitation();
  }
}

function assertPending(invitation) {
  const state = invitationState(invitation);
  if (state !== 'PENDING') throw stateError(state);
}

function publicInvitation(invitation) {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
    revokedAt: invitation.revokedAt,
    acceptedAt: invitation.acceptedAt,
    declinedAt: invitation.declinedAt,
    createdAt: invitation.createdAt,
    status: invitationState(invitation)
  };
}

function personalInvitation(invitation) {
  return {
    id: invitation.id,
    project: { id: invitation.projectId, name: invitation.project.name },
    role: invitation.role,
    createdAt: invitation.createdAt,
    expiresAt: invitation.expiresAt,
    status: invitationState(invitation)
  };
}

async function acceptResolved(invitation, user, requestId, reload) {
  assertPending(invitation);
  const result = await projectInvitationRepository.accept(invitation, user.id);
  if (result.alreadyMember) throw alreadyMember();
  if (!result.claimed) {
    const current = await reload();
    if (!current) throw invalidInvitation();
    throw stateError(invitationState(current));
  }

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
  return result.membership;
}

async function declineResolved(invitation, user, requestId, reload) {
  assertPending(invitation);
  if (!(await projectInvitationRepository.decline(invitation, user.id)).count) {
    const current = await reload();
    if (!current) throw invalidInvitation();
    throw stateError(invitationState(current));
  }

  logger.info('Convite de projeto recusado.', {
    event: 'project_invitation_declined',
    projectId: invitation.projectId,
    invitationId: invitation.id,
    actorId: user.id
  });
  await auditService.recordOperational({
    actorUserId: user.id,
    projectId: invitation.projectId,
    requestId,
    action: 'PROJECT_INVITATION_DECLINED',
    resourceType: 'ProjectInvitation',
    resourceId: invitation.id
  });
}

export const projectInvitationService = {
  async create(projectId, creatorId, { email, role }, requestId) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + env.invitationTtlMs);
    const result = await projectInvitationRepository.createUnlessPending({
      projectId,
      createdById: creatorId,
      email: normalizeEmail(email),
      role,
      tokenHash: tokenHash(token),
      expiresAt
    });
    if (result.alreadyMember) throw alreadyMember();
    if (result.alreadyPending) throw alreadyPending();

    const { invitation } = result;
    const emailDelivery = await emailService.sendProjectInvitation({
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
      invitation: publicInvitation(invitation),
      emailDelivery,
      ...(env.isTest ? { token } : {})
    };
  },
  async list(projectId) {
    if (!(await projectInvitationRepository.findProjectById(projectId))) throw invitationNotFound();
    return (await projectInvitationRepository.list(projectId)).map(publicInvitation);
  },
  async listMine(user) {
    return (
      await projectInvitationRepository.listPendingForRecipient(normalizeEmail(user.email))
    ).map(personalInvitation);
  },
  async details(token, user) {
    const invitation = await projectInvitationRepository.findByHash(tokenHash(token));
    assertRecipient(invitation, user);
    return {
      project: { id: invitation.projectId, name: invitation.project.name },
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      status: invitationState(invitation)
    };
  },
  async revoke(projectId, invitationId, actorUserId, requestId) {
    if (!(await projectInvitationRepository.revoke(projectId, invitationId)).count)
      throw invitationNotFound();
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
    assertRecipient(invitation, user);
    return acceptResolved(invitation, user, requestId, () =>
      projectInvitationRepository.findByHash(tokenHash(token))
    );
  },
  async decline(token, user, requestId) {
    const invitation = await projectInvitationRepository.findByHash(tokenHash(token));
    assertRecipient(invitation, user);
    return declineResolved(invitation, user, requestId, () =>
      projectInvitationRepository.findByHash(tokenHash(token))
    );
  },
  async acceptMine(invitationId, user, requestId) {
    const email = normalizeEmail(user.email);
    const invitation = await projectInvitationRepository.findByIdForRecipient(invitationId, email);
    if (!invitation) throw invitationNotFound();
    return acceptResolved(invitation, user, requestId, () =>
      projectInvitationRepository.findByIdForRecipient(invitationId, email)
    );
  },
  async declineMine(invitationId, user, requestId) {
    const email = normalizeEmail(user.email);
    const invitation = await projectInvitationRepository.findByIdForRecipient(invitationId, email);
    if (!invitation) throw invitationNotFound();
    return declineResolved(invitation, user, requestId, () =>
      projectInvitationRepository.findByIdForRecipient(invitationId, email)
    );
  }
};
