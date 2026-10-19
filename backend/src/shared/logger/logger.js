import { redact, sanitizeText } from './redaction.js';

function defaultWrite(level, line) {
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
}

const discard = () => {};
const runtimeEnvironment = () => process.env.NODE_ENV || 'development';

export function createLogger({ environment, write } = {}) {
  function log(level, message, context = {}) {
    const current = environment ?? runtimeEnvironment();
    const event = redact({
      timestamp: new Date().toISOString(),
      level,
      message: sanitizeText(message),
      environment: current,
      ...context
    });
    const line = JSON.stringify(event);
    (write || (current === 'test' ? discard : defaultWrite))(level, line);
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
