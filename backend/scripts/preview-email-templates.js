import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  accountReactivationTemplate,
  emailChangeConfirmationTemplate,
  emailVerificationTemplate,
  invitationTemplate,
  passwordResetTemplate,
  securityNoticeTemplate
} from '../src/shared/email/email.templates.js';

const expiresAt = new Date('2030-01-02T03:04:00.000Z');
const examples = [
  [
    'password-reset',
    passwordResetTemplate({
      resetUrl:
        'https://traceflow.example/reset-password?token=preview-token-with-a-long-value-for-line-breaking',
      expiresAt
    })
  ],
  [
    'invitation',
    invitationTemplate({
      invitationUrl:
        'https://traceflow.example/invitations/accept?token=preview-token-with-a-long-value',
      projectName: 'TraceFlow — Evolução da rastreabilidade',
      role: 'MEMBER',
      expiresAt
    })
  ],
  [
    'email-verification',
    emailVerificationTemplate({
      verificationUrl: 'https://traceflow.example/verify-email?token=preview-token',
      name: 'Daniel',
      expiresAt
    })
  ],
  [
    'email-change',
    emailChangeConfirmationTemplate({
      confirmationUrl: 'https://traceflow.example/email-change/confirm?token=preview-token',
      name: 'Daniel',
      expiresAt
    })
  ],
  [
    'account-reactivation',
    accountReactivationTemplate({
      confirmationUrl: 'https://traceflow.example/account/reactivation?token=preview-token',
      name: 'Daniel',
      expiresAt
    })
  ],
  [
    'security-notice',
    securityNoticeTemplate({
      title: 'Aviso de segurança',
      message: 'Sua senha foi alterada e as outras sessões foram encerradas.',
      name: 'Daniel'
    })
  ]
];

const requestedDirectory = process.argv[2];
const outputDirectory = requestedDirectory
  ? resolve(requestedDirectory)
  : await mkdtemp(join(tmpdir(), 'traceflow-email-preview-'));
await mkdir(outputDirectory, { recursive: true });

await Promise.all(
  examples.map(([name, message]) => writeFile(join(outputDirectory, `${name}.html`), message.html))
);
const links = examples
  .map(
    ([name, message]) =>
      `<li><a href="./${name}.html">${message.subject}</a> <code>${name}.html</code></li>`
  )
  .join('');
await writeFile(
  join(outputDirectory, 'index.html'),
  `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TraceFlow — Preview de e-mails</title><body style="margin:0;padding:32px;background:#f1f4f8;color:#172033;font:16px/1.6 Arial,sans-serif"><main style="max-width:760px;margin:auto"><h1>Preview local dos e-mails TraceFlow</h1><p>Arquivos gerados sem envio SMTP.</p><ul>${links}</ul></main></body></html>`
);

console.log(outputDirectory);
