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
