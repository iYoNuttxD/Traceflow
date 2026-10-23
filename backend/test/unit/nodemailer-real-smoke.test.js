import { describe, expect, it } from 'vitest';
import nodemailer from 'nodemailer';
import {
  passwordResetTemplate,
  emailVerificationTemplate,
  invitationTemplate
} from '../../src/shared/email/email.templates.js';

describe('Nodemailer actual JSON transport compatibility (no external delivery)', () => {
  it.each([
    ['reset', passwordResetTemplate, { resetUrl: 'https://example.invalid/reset?token=fixture' }],
    [
      'verification',
      emailVerificationTemplate,
      { verificationUrl: 'https://example.invalid/verify?token=fixture', name: '<Pessoa>' }
    ],
    [
      'invitation',
      invitationTemplate,
      {
        invitationUrl: 'https://example.invalid/invite?token=fixture',
        projectName: '<Projeto>',
        role: 'MEMBER'
      }
    ]
  ])(
    'constructs and sends the %s template through the real library',
    async (_name, template, input) => {
      const transport = nodemailer.createTransport({
        jsonTransport: true,
        disableFileAccess: true,
        disableUrlAccess: true
      });
      try {
        const content = template({ ...input, expiresAt: new Date('2030-01-01T12:00:00Z') });
        const result = await transport.sendMail({
          from: 'TraceFlow <no-reply@example.invalid>',
          to: 'test@example.invalid',
          ...content
        });
        const message = JSON.parse(result.message);
        expect(message.subject).toBe(content.subject);
        expect(message.text).toBe(content.text);
        expect(message.html).toBe(content.html);
        expect(message.html).not.toContain('<Pessoa>');
        expect(message.html).not.toContain('<Projeto>');
        expect(result.envelope.to).toEqual(['test@example.invalid']);
        expect(result.messageId).toBeTruthy();
      } finally {
        transport.close();
      }
    }
  );
});

// Real address parsing used by sendMail; no network, production mailbox or credentials.
describe('Nodemailer recipient integrity after security fixes', () => {
  it.each([
    ['nested comments', 'Victim (x(y) <other@untrusted.invalid>) <allowed@receiver.invalid>'],
    ['semicolon in a comment', 'G: (a; <other@untrusted.invalid>) <allowed@receiver.invalid>;']
  ])('preserves the actual recipient with %s', async (_name, to) => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    try {
      const result = await transport.sendMail({
        from: 'test@example.invalid',
        to,
        subject: 'Synthetic security check',
        text: 'No external delivery.'
      });
      expect(result.envelope.to).toEqual(['allowed@receiver.invalid']);
    } finally {
      transport.close();
    }
  });

  it('keeps the destination domain when a quoted local part contains >', async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    try {
      const result = await transport.sendMail({
        from: 'test@example.invalid',
        to: '<"a@untrusted.invalid>"@receiver.invalid>',
        subject: 'Synthetic security check',
        text: 'No external delivery.'
      });
      expect(result.envelope.to).toHaveLength(1);
      expect(result.envelope.to[0]).toMatch(/@receiver\.invalid$/);
    } finally {
      transport.close();
    }
  });
});
