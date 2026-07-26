import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';

const capturedMessages = [];

export function createEmailProvider(configuration = env) {
  if (configuration.emailProvider === 'capture') {
    return Object.freeze({
      async send(message) {
        capturedMessages.push({ ...message, capturedAt: new Date() });
        if (capturedMessages.length > 100) capturedMessages.shift();
        return { accepted: [message.to] };
      }
    });
  }
  const transport = nodemailer.createTransport({
    host: configuration.smtpHost,
    port: configuration.smtpPort,
    secure: configuration.smtpSecure,
    disableFileAccess: true,
    disableUrlAccess: true,
    auth: { user: configuration.smtpUser, pass: configuration.smtpPassword }
  });
  return Object.freeze({ send: (message) => transport.sendMail(message) });
}

export function getCapturedEmails() {
  if (!env.isTest) return [];
  return capturedMessages.map((message) => ({ ...message }));
}

export function clearCapturedEmails() {
  capturedMessages.length = 0;
}
