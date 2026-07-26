import { AppError, ERROR_CODES } from '../../../shared/errors/index.js';
import { logger } from '../../../shared/logger/index.js';
import { projectMembershipRepository } from '../project-membership.repository.js';
import { buildAuditEvent } from '../../audit/audit.service.js';

const notFound = () =>
  new AppError({
    message: 'Membro do projeto não encontrado.',
    statusCode: 404,
    code: ERROR_CODES.RESOURCE_NOT_FOUND,
    exposeTechnicalDetails: true
  });
const lastOwner = () =>
  new AppError({
    message: 'O projeto deve manter ao menos um proprietário ativo.',
    statusCode: 409,
    code: ERROR_CODES.LAST_PROJECT_OWNER,
    exposeTechnicalDetails: true
  });

function maskedEmail(email) {
  const [local, domain] = String(email).split('@');
  if (!domain) return undefined;
  return `${local.slice(0, 1)}***@${domain}`;
}

function publicMember(member, requesterRole) {
  return {
    ...member,
    user: {
      ...member.user,
      email: requesterRole === 'OWNER' ? member.user.email : maskedEmail(member.user.email)
    }
  };
}

export const projectMembershipService = {
  async list(projectId, requesterMembership) {
    const members = await projectMembershipRepository.list(projectId);
    return {
      currentMembership: {
        id: requesterMembership.id,
        role: requesterMembership.role,
        isActive: requesterMembership.isActive
      },
      members: members.map((member) => publicMember(member, requesterMembership.role))
    };
  },
  async updateRole(projectId, membershipId, role, actorId, requestId) {
    const result = await projectMembershipRepository.updateRoleSafely(
      projectId,
      membershipId,
      role,
      buildAuditEvent({
        actorUserId: actorId,
        projectId,
        requestId,
        action: 'PROJECT_MEMBER_ROLE_CHANGED',
        resourceType: 'ProjectMembership',
        resourceId: membershipId
      })
    );
    if (!result) throw notFound();
    if (result.lastOwner) throw lastOwner();
    logger.info('Papel de membro do projeto alterado.', {
      event: 'project_membership_role_changed',
      projectId,
      membershipId,
      actorId,
      role
    });
    return result;
  },
  async deactivate(projectId, membershipId, actorId, requestId) {
    const result = await projectMembershipRepository.setActiveSafely(
      projectId,
      membershipId,
      false,
      buildAuditEvent({
        actorUserId: actorId,
        projectId,
        requestId,
        action: 'PROJECT_MEMBER_DEACTIVATED',
        resourceType: 'ProjectMembership',
        resourceId: membershipId
      })
    );
    if (!result) throw notFound();
    if (result.lastOwner) throw lastOwner();
    logger.info('Membro do projeto desativado.', {
      event: 'project_membership_deactivated',
      projectId,
      membershipId,
      actorId
    });
  },
  async reactivate(projectId, membershipId, actorId, requestId) {
    const result = await projectMembershipRepository.setActiveSafely(
      projectId,
      membershipId,
      true,
      buildAuditEvent({
        actorUserId: actorId,
        projectId,
        requestId,
        action: 'PROJECT_MEMBER_REACTIVATED',
        resourceType: 'ProjectMembership',
        resourceId: membershipId
      })
    );
    if (!result) throw notFound();
    logger.info('Membro do projeto reativado.', {
      event: 'project_membership_reactivated',
      projectId,
      membershipId,
      actorId
    });
    return result;
  },
  async leave(projectId, userId, requestId) {
    const membership = await projectMembershipRepository.findByUser(projectId, userId);
    if (!membership) throw notFound();
    const result = await projectMembershipRepository.setActiveSafely(
      projectId,
      membership.id,
      false,
      buildAuditEvent({
        actorUserId: userId,
        projectId,
        requestId,
        action: 'PROJECT_MEMBER_LEFT',
        resourceType: 'ProjectMembership',
        resourceId: membership.id
      })
    );
    if (result?.lastOwner) throw lastOwner();
    logger.info('Membro saiu do projeto.', {
      event: 'project_membership_left',
      projectId,
      membershipId: membership.id,
      actorId: userId
    });
  },
  async transferOwnership(projectId, targetMembershipId, actorId, requestId) {
    const target = await projectMembershipRepository.transferOwnership(
      projectId,
      actorId,
      targetMembershipId,
      buildAuditEvent({
        actorUserId: actorId,
        projectId,
        requestId,
        action: 'PROJECT_OWNERSHIP_TRANSFERRED',
        resourceType: 'ProjectMembership',
        resourceId: targetMembershipId
      })
    );
    if (!target) throw notFound();
    logger.info('Propriedade do projeto transferida.', {
      event: 'project_ownership_transferred',
      projectId,
      membershipId: targetMembershipId,
      actorId
    });
    return target;
  }
};
