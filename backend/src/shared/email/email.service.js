import { env } from '../../config/env.js';
import { logger } from '../logger/index.js';
import { createEmailProvider } from './email.provider.js';
import {
  emailVerificationTemplate,
  invitationTemplate,
  passwordResetTemplate
} from './email.templates.js';

const provider = createEmailProvider();

function appendToken(base, token) {
  const url = new URL(base);
  url.searchParams.set('token', token);
  return url.toString();
}

async function safelySend(type, message, context = {}) {
  try {
    const result = await provider.send({ from: env.emailFrom, ...message });
    logger.info('E-mail transacional enviado.', { event: type, ...context });
    return {
      status: 'accepted',
      accepted: Array.isArray(result?.accepted) ? result.accepted.length > 0 : true
    };
  } catch (error) {
    const responseCode = Number(error?.responseCode);
    const temporary = responseCode >= 400 && responseCode < 500;
    logger.error('Falha no envio de e-mail transacional.', {
      event: type,
      ...context,
      deliveryStatus: temporary ? 'temporary_failure' : 'permanent_failure',
      errorCode: typeof error?.code === 'string' ? error.code : undefined
    });
    return { status: temporary ? 'temporary_failure' : 'permanent_failure', accepted: false };
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
  },
  sendEmailVerification({ to, token, expiresAt, userId, name }) {
    const verificationUrl = appendToken(env.emailVerificationUrl, token);
    return safelySend(
      'email_verification_email',
      { to, ...emailVerificationTemplate({ verificationUrl, expiresAt, name }) },
      { userId }
    );
  }
});
