export function escapeHtml(value) {
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

export function safeUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('Unsupported email link protocol.');
  return escapeHtml(url.toString());
}

export function formatEmailDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError('Invalid email date.');
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  })
    .formatToParts(date)
    .reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.day}/${parts.month}/${parts.year} às ${parts.hour}:${parts.minute} UTC`;
}

const paragraph = (content) => `
  <p style="margin:0 0 16px;color:#172033;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;">
    ${escapeHtml(content)}
  </p>`;

function renderDetails(details) {
  if (!details?.length) return '';
  const rows = details
    .map(
      ({ label, value }) => `
        <tr>
          <td style="padding:0 0 4px;color:#526078;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;line-height:1.5;text-transform:uppercase;letter-spacing:0.04em;">
            ${escapeHtml(label)}
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 16px;color:#0e1627;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:700;line-height:1.5;word-break:break-word;">
            ${escapeHtml(value)}
          </td>
        </tr>`
    )
    .join('');
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 8px;">
      ${rows}
    </table>`;
}

function renderCallToAction(label, url) {
  if (!label || !url) return '';
  const link = safeUrl(url);
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
      <tr>
        <td bgcolor="#1d45a0" style="border-radius:10px;text-align:center;">
          <a class="email-button" href="${link}" style="display:inline-block;padding:13px 22px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;line-height:1.25;text-decoration:none;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 24px;color:#526078;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;">
      Se o botão não funcionar, copie e cole este link no navegador:<br>
      <a href="${link}" style="color:#173d92;text-decoration:underline;word-break:break-all;overflow-wrap:anywhere;">${link}</a>
    </p>`;
}

function renderNotice(notice) {
  if (!notice) return '';
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 0;">
      <tr>
        <td style="border-left:4px solid #2859c5;border-radius:8px;padding:14px 16px;color:#173d92;background:#e9f0ff;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;">
          ${escapeHtml(notice)}
        </td>
      </tr>
    </table>`;
}

export function renderEmailLayout({
  title,
  greeting,
  content = [],
  details = [],
  ctaLabel,
  ctaUrl,
  notice,
  footer = 'Este é um e-mail automático.'
}) {
  const body = content.map(paragraph).join('');
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>${escapeHtml(title)}</title>
    <style>
      @media only screen and (max-width: 620px) {
        .email-outer { padding: 12px !important; }
        .email-shell { width: 100% !important; }
        .email-header, .email-content, .email-footer { padding-left: 20px !important; padding-right: 20px !important; }
        .email-button { display: block !important; text-align: center !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f1f4f8;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f1f4f8;">
      <tr>
        <td class="email-outer" align="center" style="padding:32px 16px;">
          <table class="email-shell" role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border:1px solid #d9e1ed;border-radius:14px;background:#ffffff;box-shadow:0 12px 32px rgba(27,44,76,0.08);overflow:hidden;">
            <tr>
              <td class="email-header" bgcolor="#172033" style="padding:24px 32px;background:#172033;">
                <div style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:700;line-height:1.2;letter-spacing:0.08em;">TRACEFLOW</div>
                <div style="margin-top:6px;color:#c4cfdf;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;">Gestão e rastreabilidade de projetos de software</div>
              </td>
            </tr>
            <tr>
              <td class="email-content" style="padding:32px;">
                <h1 style="margin:0 0 20px;color:#0e1627;font-family:Arial,Helvetica,sans-serif;font-size:26px;line-height:1.25;">${escapeHtml(title)}</h1>
                ${greeting ? paragraph(greeting) : ''}
                ${body}
                ${renderDetails(details)}
                ${renderCallToAction(ctaLabel, ctaUrl)}
                ${renderNotice(notice)}
              </td>
            </tr>
            <tr>
              <td class="email-footer" style="border-top:1px solid #d9e1ed;padding:20px 32px;color:#526078;background:#f7f9fc;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;">
                <strong style="color:#172033;">TraceFlow</strong><br>
                Apoio à gestão e rastreabilidade de projetos de software.<br>
                ${escapeHtml(footer)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
