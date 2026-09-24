import { formatEmailDateTime, renderEmailLayout, safeUrl } from './email.layout.js';

const roleLabels = Object.freeze({
  OWNER: 'Proprietário',
  MANAGER: 'Gerente',
  MEMBER: 'Membro',
  VIEWER: 'Visualizador'
});

const expirationNotice = (expiresAt) => `Este link é válido até ${formatEmailDateTime(expiresAt)}.`;

export function passwordResetTemplate({ resetUrl, expiresAt }) {
  safeUrl(resetUrl);
  const expiration = expirationNotice(expiresAt);
  return {
    subject: 'Redefinição de senha do TRACEFLOW',
    text: [
      'Redefina sua senha',
      '',
      'Recebemos uma solicitação para redefinir a senha da sua conta TraceFlow.',
      '',
      `Redefinir senha: ${resetUrl}`,
      expiration,
      '',
      'Se você não solicitou esta alteração, ignore este e-mail.'
    ].join('\n'),
    html: renderEmailLayout({
      title: 'Redefina sua senha',
      content: ['Recebemos uma solicitação para redefinir a senha da sua conta TraceFlow.'],
      ctaLabel: 'Redefinir senha',
      ctaUrl: resetUrl,
      notice: `${expiration} Se você não solicitou esta alteração, ignore este e-mail.`
    })
  };
}

export function invitationTemplate({ invitationUrl, projectName, role, expiresAt }) {
  safeUrl(invitationUrl);
  const expiration = expirationNotice(expiresAt);
  const roleLabel = roleLabels[role] || role;
  return {
    subject: 'Convite para projeto no TRACEFLOW',
    text: [
      'Você recebeu um convite',
      '',
      `Projeto: ${projectName}`,
      `Perfil: ${roleLabel}`,
      '',
      `Aceitar convite: ${invitationUrl}`,
      expiration
    ].join('\n'),
    html: renderEmailLayout({
      title: 'Você recebeu um convite',
      content: ['Você foi convidado para participar do projeto abaixo.'],
      details: [
        { label: 'Projeto', value: projectName },
        { label: 'Perfil', value: roleLabel }
      ],
      ctaLabel: 'Aceitar convite',
      ctaUrl: invitationUrl,
      notice: expiration
    })
  };
}

export function emailVerificationTemplate({ verificationUrl, expiresAt, name }) {
  safeUrl(verificationUrl);
  const expiration = expirationNotice(expiresAt);
  return {
    subject: 'Verifique seu e-mail no TRACEFLOW',
    text: [
      `Olá, ${name}.`,
      '',
      'Confirme seu endereço de e-mail para concluir a configuração da sua conta e acessar os recursos do TraceFlow.',
      '',
      `Verificar e-mail: ${verificationUrl}`,
      expiration
    ].join('\n'),
    html: renderEmailLayout({
      title: 'Confirme seu e-mail',
      greeting: `Olá, ${name}.`,
      content: [
        'Confirme seu endereço de e-mail para concluir a configuração da sua conta e acessar os recursos do TraceFlow.'
      ],
      ctaLabel: 'Verificar e-mail',
      ctaUrl: verificationUrl,
      notice: expiration
    })
  };
}

export function emailChangeConfirmationTemplate({ confirmationUrl, expiresAt, name }) {
  safeUrl(confirmationUrl);
  const expiration = expirationNotice(expiresAt);
  return {
    subject: 'Confirme seu novo e-mail no TRACEFLOW',
    text: [
      `Olá, ${name}.`,
      '',
      'Recebemos uma solicitação para alterar o endereço de e-mail da sua conta.',
      '',
      `Confirmar novo e-mail: ${confirmationUrl}`,
      expiration,
      '',
      'Se você não solicitou esta alteração, nenhuma ação é necessária.'
    ].join('\n'),
    html: renderEmailLayout({
      title: 'Confirme seu novo e-mail',
      greeting: `Olá, ${name}.`,
      content: ['Recebemos uma solicitação para alterar o endereço de e-mail da sua conta.'],
      ctaLabel: 'Confirmar novo e-mail',
      ctaUrl: confirmationUrl,
      notice: `${expiration} Se você não solicitou esta alteração, nenhuma ação é necessária.`
    })
  };
}

export function securityNoticeTemplate({ title, message, name }) {
  return {
    subject: title,
    text: [
      `Olá, ${name}.`,
      '',
      message,
      '',
      'Se você reconhece esta alteração, nenhuma ação é necessária.',
      'Caso não reconheça, revise sua conta no TraceFlow.'
    ].join('\n'),
    html: renderEmailLayout({
      title,
      greeting: `Olá, ${name}.`,
      content: [message],
      notice:
        'Se você reconhece esta alteração, nenhuma ação é necessária. Caso não reconheça, revise sua conta no TraceFlow.'
    })
  };
}

export function accountReactivationTemplate({ confirmationUrl, expiresAt, name }) {
  safeUrl(confirmationUrl);
  const expiration = expirationNotice(expiresAt);
  return {
    subject: 'Reative sua conta TRACEFLOW',
    text: [
      `Olá, ${name}.`,
      '',
      'Recebemos uma solicitação para reativar sua conta TraceFlow.',
      '',
      `Reativar conta: ${confirmationUrl}`,
      expiration
    ].join('\n'),
    html: renderEmailLayout({
      title: 'Reative sua conta',
      greeting: `Olá, ${name}.`,
      content: ['Recebemos uma solicitação para reativar sua conta TraceFlow.'],
      ctaLabel: 'Reativar conta',
      ctaUrl: confirmationUrl,
      notice: expiration
    })
  };
}
