import { env } from '../../../config/env.js';
import { projectRepository } from '../project.repository.js';
import { ProjectServiceError } from '../project.schema.js';

function generateAccessCode() {
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TRC-${randomPart}`;
}

function buildInviteLink(accessCode) {
  const frontendUrl = env.frontendUrl.replace(/\/+$/, '');
  return `${frontendUrl}/join/${accessCode}`;
}

export async function buildProjectInviteData() {
  const maxAttempts = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const accessCode = generateAccessCode();
    const existingProject = await projectRepository.findProjectByAccessCode(accessCode);

    if (!existingProject) {
      return { accessCode, inviteLink: buildInviteLink(accessCode) };
    }
  }

  throw new ProjectServiceError('Não foi possível gerar um código de acesso único.', 500);
}
