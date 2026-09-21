import { describe, expect, it } from 'vitest';
import { formatEmailDateTime, renderEmailLayout } from '../../src/shared/email/email.layout.js';
import {
  accountReactivationTemplate,
  emailChangeConfirmationTemplate,
  emailVerificationTemplate,
  invitationTemplate,
  passwordResetTemplate,
  securityNoticeTemplate
} from '../../src/shared/email/email.templates.js';

const expiresAt = new Date('2030-01-02T03:04:00.000Z');
const expectedExpiration = '02/01/2030 às 03:04 UTC';

const actionTemplates = [
  [
    'reset de senha',
    passwordResetTemplate,
    { resetUrl: 'https://traceflow.test/reset?token=fake', expiresAt },
    'Redefinir senha',
    'Redefinição de senha do TRACEFLOW'
  ],
  [
    'convite',
    invitationTemplate,
    {
      invitationUrl: 'https://traceflow.test/invitations/accept?token=fake',
      projectName: 'TraceFlow',
      role: 'MEMBER',
      expiresAt
    },
    'Aceitar convite',
    'Convite para projeto no TRACEFLOW'
  ],
  [
    'verificação',
    emailVerificationTemplate,
    {
      verificationUrl: 'https://traceflow.test/verify?token=fake',
      name: 'Daniel',
      expiresAt
    },
    'Verificar e-mail',
    'Verifique seu e-mail no TRACEFLOW'
  ],
  [
    'alteração de e-mail',
    emailChangeConfirmationTemplate,
    {
      confirmationUrl: 'https://traceflow.test/email-change?token=fake',
      name: 'Daniel',
      expiresAt
    },
    'Confirmar novo e-mail',
    'Confirme seu novo e-mail no TRACEFLOW'
  ],
  [
    'reativação',
    accountReactivationTemplate,
    {
      confirmationUrl: 'https://traceflow.test/reactivate?token=fake',
      name: 'Daniel',
      expiresAt
    },
    'Reativar conta',
    'Reative sua conta TRACEFLOW'
  ]
];

describe('templates transacionais C2', () => {
  it.each(actionTemplates)(
    'renderiza %s com branding, CTA, fallback e expiração UTC',
    (_, template, input, cta, subject) => {
      const message = template(input);
      const url = Object.entries(input).find(([key]) => key.endsWith('Url'))[1];
      expect(message.subject).toBe(subject);
      expect(message.text).toContain(url);
      expect(message.text).toContain(expectedExpiration);
      expect(message.html).toContain('TRACEFLOW');
      expect(message.html).toMatch(
        new RegExp(`<a class="email-button"[^>]*>[\\s\\S]*?${cta}[\\s\\S]*?</a>`)
      );
      expect(message.html).toContain(`href="${url.replace('&', '&amp;')}"`);
      expect(message.html).toContain('Se o botão não funcionar');
      expect(message.html).toContain(expectedExpiration);
    }
  );

  it('usa labels humanas no convite', () => {
    const message = invitationTemplate({
      invitationUrl: 'https://traceflow.test/invite',
      projectName: 'Projeto',
      role: 'OWNER',
      expiresAt
    });
    expect(message.text).toContain('Perfil: Proprietário');
    expect(message.html).toContain('Proprietário');
    expect(message.html).not.toContain('>OWNER<');
  });

  it('renderiza aviso de segurança sem inventar CTA', () => {
    const message = securityNoticeTemplate({
      title: 'Aviso de segurança',
      message: 'Sua senha foi alterada.',
      name: 'Daniel'
    });
    expect(message).toMatchObject({ subject: 'Aviso de segurança' });
    expect(message.text).toContain('Caso não reconheça');
    expect(message.html).toContain('Aviso de segurança');
    expect(message.html).toContain('Caso não reconheça');
    expect(message.html).not.toContain('<a class="email-button"');
  });

  it('escapa todo conteúdo dinâmico sem aceitar HTML arbitrário', () => {
    const attack = `<script>alert(1)</script><img src=x onerror="alert(2)">'><`;
    const invitation = invitationTemplate({
      invitationUrl: 'https://traceflow.test/invite?token=safe',
      projectName: attack,
      role: attack,
      expiresAt
    });
    const notice = securityNoticeTemplate({ title: attack, message: attack, name: attack });
    for (const html of [invitation.html, notice.html]) {
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('&lt;img');
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).not.toContain('<img src=x');
      expect(html).not.toContain('onerror="alert(2)"');
    }
  });

  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///tmp/a'])(
    'rejeita protocolo inseguro %s',
    (resetUrl) => {
      expect(() => passwordResetTemplate({ resetUrl, expiresAt })).toThrow(
        'Unsupported email link protocol.'
      );
    }
  );

  it('preserva HTTP e HTTPS como protocolos permitidos', () => {
    for (const resetUrl of ['http://localhost/reset', 'https://traceflow.test/reset']) {
      expect(() => passwordResetTemplate({ resetUrl, expiresAt })).not.toThrow();
    }
  });

  it('formata datas explicitamente em UTC sem alterar o instante', () => {
    expect(formatEmailDateTime(expiresAt)).toBe(expectedExpiration);
    expect(expiresAt.toISOString()).toBe('2030-01-02T03:04:00.000Z');
  });

  it('mantém o layout independente de recursos frágeis ou assets externos', () => {
    const html = renderEmailLayout({ title: 'Teste', content: ['Conteúdo'] });
    expect(html).toContain('role="presentation"');
    expect(html).toContain('max-width:600px');
    expect(html).not.toMatch(
      /var\(--|display:\s*(?:flex|grid)|<script|stylesheet|https?:\/\/[^"<]+\.(?:css|png|jpg)/i
    );
  });
});
