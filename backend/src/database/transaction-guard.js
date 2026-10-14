import { logger } from '../shared/logger/index.js';
import { lockWaitSecondsFor } from './lock-wait.js';
import { killQuery } from './recovery-prisma.js';

const DEFAULT_TIMEOUT_MS = 5000;
const KILL_REPEAT_MS = 100;
export const DEADLINE_MARGIN_MS = 1000;

export class TransactionDeadlineError extends Error {
  constructor(timeoutMs, cause) {
    super(
      `A transação passou do prazo de ${timeoutMs} ms e foi desfeita.`,
      cause === undefined ? undefined : { cause }
    );
    this.name = 'TransactionDeadlineError';
    this.code = 'TRANSACTION_DEADLINE';
    this.timeoutMs = timeoutMs;
  }
}

export function isTransactionDeadline(error) {
  return error instanceof TransactionDeadlineError;
}

function causeCodeOf(error) {
  return String(error?.code ?? error?.name ?? 'UNKNOWN').slice(0, 64);
}

function startWatchdog(timeoutMs, interrupt, log) {
  const state = { connectionId: null, fired: false, done: false, kills: [] };
  const kill = () => {
    const { connectionId } = state;
    if (state.done || !connectionId) return;
    state.kills.push(
      Promise.resolve()
        .then(() => interrupt(connectionId))
        .catch((error) => {
          log.warn('Não foi possível interromper a instrução da transação vencida.', {
            event: 'database_transaction_kill_failed',
            connectionId,
            causeCode: causeCodeOf(error)
          });
        })
    );
  };
  let repeat = null;
  const timer = setTimeout(() => {
    state.fired = true;
    kill();
    repeat = setInterval(kill, KILL_REPEAT_MS);
  }, timeoutMs);

  return {
    state,
    async stop() {
      state.done = true;
      clearTimeout(timer);
      clearInterval(repeat);
      await Promise.all(state.kills);
    }
  };
}

export function guardTransactions(client, { killQuery: interrupt = killQuery, log = logger } = {}) {
  const transaction = client.$transaction;
  client.$transaction = function guardedTransaction(argument, options) {
    if (typeof argument !== 'function') return transaction.call(this, argument, options);
    const timeoutMs = options?.timeout ?? DEFAULT_TIMEOUT_MS;

    return transaction.call(
      this,
      async (tx) => {
        const watchdog = startWatchdog(timeoutMs, interrupt, log);
        let outcome;
        try {
          await tx.$executeRawUnsafe(
            `SET SESSION innodb_lock_wait_timeout = ${lockWaitSecondsFor(timeoutMs)}`
          );
          watchdog.state.connectionId = Number(
            (await tx.$queryRawUnsafe('SELECT CONNECTION_ID() AS id'))[0].id
          );
          outcome = { value: await argument(tx) };
        } catch (error) {
          outcome = { error };
        }
        await watchdog.stop();
        if (watchdog.state.fired) throw new TransactionDeadlineError(timeoutMs, outcome.error);
        if ('error' in outcome) throw outcome.error;
        return outcome.value;
      },
      { ...options, timeout: timeoutMs + DEADLINE_MARGIN_MS }
    );
  };
  return client;
}
