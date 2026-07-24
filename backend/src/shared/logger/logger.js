import { env } from '../../config/env.js';
import { redact, sanitizeText } from './redaction.js';

function defaultWrite(level, line) {
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
}

export function createLogger({ environment = env.nodeEnv, write } = {}) {
  const output = write || (environment === 'test' ? () => {} : defaultWrite);
  function log(level, message, context = {}) {
    const event = redact({
      timestamp: new Date().toISOString(),
      level,
      message: sanitizeText(message),
      environment,
      ...context
    });
    const line = JSON.stringify(event);
    output(level, line);
    return event;
  }

  return Object.freeze({
    debug: (message, context) => log('debug', message, context),
    info: (message, context) => log('info', message, context),
    warn: (message, context) => log('warn', message, context),
    error: (message, context) => log('error', message, context)
  });
}

export const logger = createLogger();
