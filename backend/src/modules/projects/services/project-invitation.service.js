import { createHash, randomBytes } from 'node:crypto';
import { env } from '../../../config/env.js';
import { AppError, ERROR_CODES } from '../../../shared/errors/index.js';
import { projectInvitationRepository } from '../project-invitation.repository.js';

const tokenHash = (value) => createHash('sha256').update(value).digest('hex');
const invalidInvitation = () => new AppError({ message: 'Convite inválido ou expirado.', statusCode: 400, code: ERROR_CODES.INVITATION_INVALID, exposeTechnicalDetails: true });

export const projectInvitationService = {
  async create(projectId, creatorId, { email, role }) {
    const token = randomBytes(32).toString('base64url');
    const invitation = await projectInvitationRepository.create({
      projectId, createdById: creatorId, email: email.trim().toLowerCase(), role,
      tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + env.invitationTtlMs)
    });
    return { invitation: { id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt }, token };
  },
  list(projectId) { return projectInvitationRepository.list(projectId); },
  async revoke(projectId, invitationId) {
    if (!(await projectInvitationRepository.revoke(projectId, invitationId)).count) throw invalidInvitation();
  },
  async accept(token, user) {
    const invitation = await projectInvitationRepository.findByHash(tokenHash(token));
    if (!invitation || invitation.revokedAt || invitation.acceptedAt || invitation.expiresAt <= new Date() || invitation.email !== user.email) throw invalidInvitation();
    return projectInvitationRepository.accept(invitation, user.id);
  }
};
