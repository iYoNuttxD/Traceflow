import { describe, expect, it, vi } from 'vitest';
import nodemailer from 'nodemailer';
import {
  invitationTemplate,
  passwordResetTemplate
} from '../../src/shared/email/email.templates.js';
import { createEmailProvider } from '../../src/shared/email/email.provider.js';
import { cleanupAuthRecords } from '../../src/shared/maintenance/auth-cleanup.js';
import {
  isProductionDatabase,
  validateTestDatabaseUrl,
  sanitizedDatabaseTarget
} from '../../scripts/lib/database-safety.js';
import { authorizationService } from '../../src/modules/authorization/authorization.service.js';

describe('e-mail transacional da E6', () => {
  it('escapa conteúdo variável e mantém links HTTP seguros', () => {
    const expiresAt = new Date('2030-01-01T00:00:00.000Z');
    const invitation = invitationTemplate({
      invitationUrl: 'https://traceflow.test/accept?token=fake',
      projectName: '<script>',
      role: 'MEMBER',
      expiresAt
    });
    expect(invitation.html).toContain('&lt;script&gt;');
    expect(invitation.html).not.toContain('<script>');
    for (const resetUrl of ['javascript:alert(1)', 'data:text/html,unsafe']) {
      expect(() => passwordResetTemplate({ resetUrl, expiresAt })).toThrow();
    }
    expect(
      passwordResetTemplate({ resetUrl: 'https://traceflow.test/reset?a=1&b=2', expiresAt }).html
    ).toContain('href="https://traceflow.test/reset?a=1&amp;b=2"');
    expect(
      passwordResetTemplate({ resetUrl: 'https://traceflow.test/reset?token=fake', expiresAt })
        .subject
    ).toMatch(/senha/i);
  });

  it('configura o adapter SMTP sem efetuar rede', async () => {
    const sendMail = vi.fn().mockResolvedValue({ accepted: ['fake@example.invalid'] });
    const spy = vi.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail });
    const provider = createEmailProvider({
      emailProvider: 'smtp',
      smtpHost: 'smtp.example.invalid',
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: 'mailer',
      smtpPassword: 'secret'
    });
    await provider.send({ to: 'fake@example.invalid', subject: 'Teste', text: 'Teste' });
    expect(spy).toHaveBeenCalledWith({
      host: 'smtp.example.invalid',
      port: 587,
      secure: false,
      disableFileAccess: true,
      disableUrlAccess: true,
      auth: { user: 'mailer', pass: 'secret' }
    });
    expect(sendMail).toHaveBeenCalledExactlyOnceWith({
      to: 'fake@example.invalid',
      subject: 'Teste',
      text: 'Teste'
    });
    spy.mockRestore();
  });
});

describe('limpeza operacional da E6', () => {
  it('é dry-run por padrão e aplica somente quando solicitado', async () => {
    const calls = [];
    const model = (name) => ({
      count: async ({ where }) => {
        calls.push(['count', name, where]);
        return 2;
      },
      deleteMany: ({ where }) => ({ name, where })
    });
    const client = {
      session: model('session'),
      passwordResetToken: model('reset'),
      projectInvitation: model('invitation'),
      emailVerificationToken: model('verification'),
      gitHubAppConnectionState: model('github-state'),
      gitHubOAuthState: model('github-oauth-state'),
      gitHubWebhookDelivery: model('github-delivery'),
      $transaction: async (operations) => {
        calls.push(['transaction', operations]);
      }
    };
    const configuration = {
      sessionRetentionDays: 30,
      passwordResetRetentionDays: 7,
      invitationRetentionDays: 30,
      emailVerificationRetentionDays: 7,
      githubConnectionStateRetentionDays: 7,
      githubWebhookDeliveryRetentionDays: 30
    };
    const now = new Date('2030-02-01T00:00:00.000Z');
    expect((await cleanupAuthRecords({ client, configuration, now })).mode).toBe('dry-run');
    expect(calls.some(([type]) => type === 'transaction')).toBe(false);
    expect((await cleanupAuthRecords({ client, configuration, now, apply: true })).mode).toBe(
      'apply'
    );
    const shortCutoff = new Date('2030-01-25T00:00:00.000Z');
    const longCutoff = new Date('2030-01-02T00:00:00.000Z');
    expect(calls.find(([type]) => type === 'transaction')[1]).toEqual([
      {
        name: 'github-state',
        where: { OR: [{ expiresAt: { lt: shortCutoff } }, { usedAt: { lt: shortCutoff } }] }
      },
      {
        name: 'github-oauth-state',
        where: { OR: [{ expiresAt: { lt: shortCutoff } }, { usedAt: { lt: shortCutoff } }] }
      },
      {
        name: 'session',
        where: { OR: [{ expiresAt: { lt: longCutoff } }, { revokedAt: { lt: longCutoff } }] }
      },
      {
        name: 'verification',
        where: { OR: [{ expiresAt: { lt: shortCutoff } }, { usedAt: { lt: shortCutoff } }] }
      },
      {
        name: 'reset',
        where: { OR: [{ expiresAt: { lt: shortCutoff } }, { usedAt: { lt: shortCutoff } }] }
      },
      {
        name: 'invitation',
        where: {
          OR: [
            { expiresAt: { lt: longCutoff } },
            { revokedAt: { lt: longCutoff } },
            { acceptedAt: { lt: longCutoff } },
            { declinedAt: { lt: longCutoff } }
          ]
        }
      },
      { name: 'github-delivery', where: { receivedAt: { lt: longCutoff } } }
    ]);
  });
});

describe('proteção dos comandos Prisma de teste', () => {
  it('rejeita banco sem marcador test e sanitiza o destino', () => {
    expect(() => validateTestDatabaseUrl('mysql://u:p@localhost/traceflow', undefined)).toThrow(
      /teste/
    );
    expect(() =>
      validateTestDatabaseUrl(
        'mysql://u:p@localhost/traceflow_test',
        'mysql://u:p@localhost/traceflow_test'
      )
    ).toThrow(/diferente/);
    expect(sanitizedDatabaseTarget('mysql://u:secret@db.local:3307/traceflow_test')).toEqual({
      host: 'db.local',
      port: '3307',
      database: 'traceflow_test'
    });
    expect(isProductionDatabase('mysql://u:p@db.local/traceflow_production')).toBe(true);
  });
});

describe('matriz RBAC da E6', () => {
  it('ordena os quatro papéis e reserva administração/sync', () => {
    expect(authorizationService.permits('VIEWER', 'MEMBER')).toBe(false);
    expect(authorizationService.permits('MEMBER', 'MEMBER')).toBe(true);
    expect(authorizationService.permits('MANAGER', 'MANAGER')).toBe(true);
    expect(authorizationService.permits('OWNER', 'OWNER')).toBe(true);
    const roles = ['VIEWER', 'MEMBER', 'MANAGER', 'OWNER'];
    roles.forEach((actual, level) =>
      roles.forEach((required, minimum) => {
        expect(authorizationService.permits(actual, required)).toBe(level >= minimum);
      })
    );
    for (const required of roles)
      expect(authorizationService.permits('UNKNOWN', required)).toBe(false);
    expect(
      authorizationService.requiredRole({ method: 'PATCH', path: '/projects/1/members/2' })
    ).toBe('OWNER');
    expect(
      authorizationService.requiredRole({ method: 'POST', path: '/projects/1/github/sync' })
    ).toBe('MANAGER');
    expect(
      authorizationService.requiredRole({ method: 'GET', path: '/projects/1/access-code' })
    ).toBe('OWNER');
    expect(
      authorizationService.requiredRole({ method: 'PATCH', path: '/projects/1/access-code' })
    ).toBe('OWNER');
    expect(authorizationService.requiredRole({ method: 'GET', path: '/projects/1/tasks' })).toBe(
      'VIEWER'
    );
  });
});
