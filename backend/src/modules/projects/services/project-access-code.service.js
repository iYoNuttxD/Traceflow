import { randomBytes } from 'node:crypto';
import { env } from '../../../config/env.js';
import { AppError, ERROR_CODES } from '../../../shared/errors/index.js';
import { logger } from '../../../shared/logger/index.js';
import { auditService, buildAuditEvent } from '../../audit/audit.service.js';
import { projectAccessCodeRepository } from '../project-access-code.repository.js';
import { normalizeAccessCode, parseProjectId } from '../project.schema.js';

const allowedRoles = new Set(['MEMBER', 'VIEWER']);
const maxCodeAttempts = 5;

function notFound() {
  return new AppError({
    message: 'Projeto não encontrado.',
    statusCode: 404,
    code: ERROR_CODES.RESOURCE_NOT_FOUND,
    exposeTechnicalDetails: true
  });
}

function invalidCode() {
  return new AppError({
    message: 'Código de acesso inválido.',
    statusCode: 404,
    code: ERROR_CODES.PROJECT_ACCESS_CODE_INVALID,
    exposeTechnicalDetails: true
  });
}

function alreadyMember() {
  return new AppError({
    message: 'Você já participa deste projeto.',
    statusCode: 409,
    code: ERROR_CODES.PROJECT_MEMBER_ALREADY_EXISTS,
    exposeTechnicalDetails: true
  });
}

function inactiveMembership() {
  return new AppError({
    message: 'Sua participação está inativa. Solicite a reativação ao proprietário do projeto.',
    statusCode: 409,
    code: ERROR_CODES.PROJECT_MEMBERSHIP_INACTIVE,
    exposeTechnicalDetails: true
  });
}

export function createAccessCode() {
  return `TRC-${randomBytes(16).toString('hex').toUpperCase()}`;
}

export function buildInviteLink(accessCode) {
  const frontendUrl = env.frontendUrl.replace(/\/+$/, '');
  return `${frontendUrl}/join/${accessCode}`;
}

async function createUniqueAccessCode() {
  for (let attempt = 0; attempt < maxCodeAttempts; attempt += 1) {
    const accessCode = createAccessCode();
    if (!(await projectAccessCodeRepository.findCodeOwner(accessCode))) return accessCode;
  }
  throw new AppError({
    message: 'Não foi possível gerar um código de acesso.',
    statusCode: 500,
    code: ERROR_CODES.INTERNAL_ERROR
  });
}

function publicConfiguration(configuration) {
  return {
    accessCode: configuration.accessCode,
    role: configuration.accessCodeRole,
    inviteLink: buildInviteLink(configuration.accessCode)
  };
}

export async function buildProjectAccessData() {
  const accessCode = await createUniqueAccessCode();
  return {
    accessCode,
    accessCodeRole: 'MEMBER',
    inviteLink: buildInviteLink(accessCode)
  };
}

export const projectAccessCodeService = {
  async configuration(projectId) {
    const configuration = await projectAccessCodeRepository.findConfiguration(
      parseProjectId(projectId)
    );
    if (!configuration) throw notFound();
    return publicConfiguration(configuration);
  },

  async details(accessCode) {
    const normalized = normalizeAccessCode(accessCode);
    const project = normalized && (await projectAccessCodeRepository.findByCode(normalized));
    if (!project) throw invalidCode();
    return {
      project: { id: project.id, name: project.name },
      role: project.accessCodeRole
    };
  },

  async regenerate(projectId, actorUserId, requestId) {
    const parsedProjectId = parseProjectId(projectId);
    if (!(await projectAccessCodeRepository.findConfiguration(parsedProjectId))) throw notFound();

    for (let attempt = 0; attempt < maxCodeAttempts; attempt += 1) {
      const accessCode = await createUniqueAccessCode();
      try {
        const configuration = await projectAccessCodeRepository.regenerate(
          parsedProjectId,
          accessCode,
          buildInviteLink(accessCode)
        );
        await auditService.recordOperational({
          actorUserId,
          projectId: parsedProjectId,
          requestId,
          action: 'PROJECT_ACCESS_CODE_REGENERATED',
          resourceType: 'Project',
          resourceId: parsedProjectId
        });
        logger.info('Código de acesso do projeto regenerado.', {
          event: 'project_access_code_regenerated',
          projectId: parsedProjectId,
          actorId: actorUserId,
          requestId
        });
        return publicConfiguration(configuration);
      } catch (error) {
        if (error?.code !== 'P2002' || attempt === maxCodeAttempts - 1) throw error;
      }
    }
    throw invalidCode();
  },

  async updateRole(projectId, role, actorUserId, requestId) {
    if (!allowedRoles.has(role)) {
      throw new AppError({
        message: 'O perfil do código deve ser Membro ou Visualizador.',
        statusCode: 400,
        code: ERROR_CODES.VALIDATION_ERROR,
        exposeTechnicalDetails: true
      });
    }
    const parsedProjectId = parseProjectId(projectId);
    const current = await projectAccessCodeRepository.findConfiguration(parsedProjectId);
    if (!current) throw notFound();
    if (current.accessCodeRole === role) return publicConfiguration(current);

    const configuration = await projectAccessCodeRepository.updateRole(parsedProjectId, role);
    await auditService.recordOperational({
      actorUserId,
      projectId: parsedProjectId,
      requestId,
      action: 'PROJECT_ACCESS_CODE_ROLE_CHANGED',
      resourceType: 'Project',
      resourceId: parsedProjectId,
      metadata: { previousRole: current.accessCodeRole, newRole: role }
    });
    logger.info('Perfil do código de acesso alterado.', {
      event: 'project_access_code_role_changed',
      projectId: parsedProjectId,
      actorId: actorUserId,
      role,
      requestId
    });
    return publicConfiguration(configuration);
  },

  async join(accessCode, user, requestId) {
    const normalized = normalizeAccessCode(accessCode);
    if (!normalized) throw invalidCode();
    const result = await projectAccessCodeRepository.join(
      normalized,
      user.id,
      buildAuditEvent({
        actorUserId: user.id,
        requestId,
        action: 'PROJECT_JOINED_BY_ACCESS_CODE',
        resourceType: 'ProjectMembership'
      })
    );
    if (result.invalidCode) throw invalidCode();
    if (result.alreadyMember) throw alreadyMember();
    if (result.inactiveMembership) throw inactiveMembership();

    logger.info('Usuário ingressou em projeto por código de acesso.', {
      event: 'project_joined_by_access_code',
      projectId: result.project.id,
      membershipId: result.membership.id,
      actorId: user.id,
      role: result.membership.role,
      requestId
    });
    return {
      project: { id: result.project.id, name: result.project.name },
      membership: result.membership
    };
  }
};
