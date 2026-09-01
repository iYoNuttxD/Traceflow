import { env } from '../../config/env.js';
import { logger } from '../logger/index.js';
import { createEmailProvider } from './email.provider.js';
import {
  accountReactivationTemplate,
  emailChangeConfirmationTemplate,
  emailVerificationTemplate,
  invitationTemplate,
  passwordResetTemplate,
  securityNoticeTemplate
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
  },
  sendEmailChangeConfirmation({ to, token, expiresAt, userId, name }) {
    const confirmationUrl = appendToken(env.emailChangeUrl, token);
    return safelySend(
      'email_change_confirmation',
      { to, ...emailChangeConfirmationTemplate({ confirmationUrl, expiresAt, name }) },
      { userId }
    );
  },
  sendEmailChangedNotice({ to, userId, name }) {
    return safelySend(
      'email_changed_notice',
      {
        to,
        ...securityNoticeTemplate({
          title: 'E-mail alterado no TRACEFLOW',
          message:
            'O e-mail principal da sua conta foi alterado. Se você não reconhece essa ação, contate o suporte.',
          name
        })
      },
      { userId }
    );
  },
  sendPasswordChangedNotice({ to, userId, name }) {
    return safelySend(
      'password_changed_notice',
      {
        to,
        ...securityNoticeTemplate({
          title: 'Senha alterada no TRACEFLOW',
          message: 'Sua senha foi alterada e as outras sessões foram encerradas.',
          name
        })
      },
      { userId }
    );
  },
  sendAccountDeactivatedNotice({ to, userId, name }) {
    return safelySend(
      'account_deactivated_notice',
      {
        to,
        ...securityNoticeTemplate({
          title: 'Conta TRACEFLOW desativada',
          message: 'Sua conta foi desativada e está em modo restrito.',
          name
        })
      },
      { userId }
    );
  },
  sendAccountReactivation({ to, token, expiresAt, userId, name }) {
    const confirmationUrl = appendToken(env.accountReactivationUrl, token);
    return safelySend(
      'account_reactivation',
      { to, ...accountReactivationTemplate({ confirmationUrl, expiresAt, name }) },
      { userId }
    );
  },
  sendAccountDeletionRequested({ to, scheduledFor, userId, name }) {
    return safelySend(
      'account_deletion_requested',
      {
        to,
        ...securityNoticeTemplate({
          title: 'Exclusão da conta TRACEFLOW solicitada',
          message: `Sua conta será anonimizada após ${scheduledFor.toISOString()}, salvo cancelamento.`,
          name
        })
      },
      { userId }
    );
  },
  sendAccountDeletionCancelled({ to, userId, name }) {
    return safelySend(
      'account_deletion_cancelled',
      {
        to,
        ...securityNoticeTemplate({
          title: 'Exclusão da conta TRACEFLOW cancelada',
          message: 'Sua solicitação foi cancelada. Faça login novamente.',
          name
        })
      },
      { userId }
    );
  }
});
