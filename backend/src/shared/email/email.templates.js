function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[character]
  );
}

function safeUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('Unsupported email link protocol.');
  return escapeHtml(url.toString());
}

export function passwordResetTemplate({ resetUrl, expiresAt }) {
  const link = safeUrl(resetUrl);
  return {
    subject: 'Redefinição de senha do TRACEFLOW',
    text: `Use este link para redefinir sua senha: ${resetUrl}\nO link expira em ${expiresAt.toISOString()}.`,
    html: `<p>Use o link abaixo para redefinir sua senha no TRACEFLOW.</p><p><a href="${link}">Redefinir senha</a></p><p>Expira em ${escapeHtml(expiresAt.toISOString())}.</p>`
  };
}

export function invitationTemplate({ invitationUrl, projectName, role, expiresAt }) {
  const link = safeUrl(invitationUrl);
  return {
    subject: 'Convite para projeto no TRACEFLOW',
    text: `Você foi convidado para o projeto ${projectName} como ${role}. Aceite em: ${invitationUrl}\nExpira em ${expiresAt.toISOString()}.`,
    html: `<p>Você foi convidado para o projeto <strong>${escapeHtml(projectName)}</strong> como ${escapeHtml(role)}.</p><p><a href="${link}">Aceitar convite</a></p><p>Expira em ${escapeHtml(expiresAt.toISOString())}.</p>`
  };
}

export function emailVerificationTemplate({ verificationUrl, expiresAt, name }) {
  const link = safeUrl(verificationUrl);
  const safeName = escapeHtml(name);
  return {
    subject: 'Verifique seu e-mail no TRACEFLOW',
    text: `Olá, ${name}. Verifique seu e-mail em: ${verificationUrl}\nO link expira em ${expiresAt.toISOString()}.`,
    html: `<p>Olá, ${safeName}.</p><p>Confirme seu e-mail para liberar ações sensíveis no TRACEFLOW.</p><p><a href="${link}">Verificar e-mail</a></p><p>Expira em ${escapeHtml(expiresAt.toISOString())}.</p>`
  };
}
