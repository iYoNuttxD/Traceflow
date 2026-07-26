import { env } from '../../config/env.js';
import { logger } from '../logger/index.js';
import { createEmailProvider } from './email.provider.js';
import { invitationTemplate, passwordResetTemplate } from './email.templates.js';

const provider = createEmailProvider();

function appendToken(base, token) {
  const url = new URL(base);
  url.searchParams.set('token', token);
  return url.toString();
}

async function safelySend(type, message, context = {}) {
  try {
    await provider.send({ from: env.emailFrom, ...message });
    logger.info('E-mail transacional enviado.', { event: type, ...context });
    return true;
  } catch {
    logger.error('Falha no envio de e-mail transacional.', { event: type, ...context });
    return false;
  }
}

export const emailService = Object.freeze({
  sendPasswordReset({ to, token, expiresAt, userId }) {
    const resetUrl = appendToken(env.passwordResetUrl, token);
    return safelySend(
      'password_reset_email',
      { to, ...passwordResetTemplate({ resetUrl, expiresAt }) },
      { userId }
    );
  },
  sendProjectInvitation({ to, token, expiresAt, projectName, role, projectId, invitationId }) {
    const invitationUrl = appendToken(env.invitationAcceptUrl, token);
    return safelySend(
      'project_invitation_email',
      { to, ...invitationTemplate({ invitationUrl, projectName, role, expiresAt }) },
      { projectId, invitationId }
    );
  }
});
