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
    requireTLS: Boolean(configuration.isProduction && !configuration.smtpSecure),
    opportunisticTLS: false,
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    connectionTimeout: configuration.smtpConnectionTimeoutMs ?? 10000,
    greetingTimeout: configuration.smtpGreetingTimeoutMs ?? 10000,
    socketTimeout: configuration.smtpSocketTimeoutMs ?? 20000,
    dnsTimeout: configuration.smtpConnectionTimeoutMs ?? 10000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
    auth: { user: configuration.smtpUser, pass: configuration.smtpPassword }
  });
  return Object.freeze({
    async send(message) {
      try {
        return await transport.sendMail(message);
      } catch (failure) {
        // SMTP responses can echo recipients, credentials and provider diagnostics.
        const error = new Error('Não foi possível enviar o e-mail.');
        error.code = 'EMAIL_DELIVERY_FAILED';
        // Preserve the service contract for temporary 4xx failures without raw SMTP text.
        const responseCode = Number(failure?.responseCode);
        if (Number.isInteger(responseCode) && responseCode >= 400 && responseCode <= 599)
          error.responseCode = responseCode;
        throw error;
      }
    }
  });
}

export function getCapturedEmails() {
  if (!env.isTest) return [];
  return capturedMessages.map((message) => ({ ...message }));
}

export function clearCapturedEmails() {
  capturedMessages.length = 0;
}
