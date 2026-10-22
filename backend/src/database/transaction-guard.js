import { logger } from '../shared/logger/index.js';
import { isEnginePanic, markEngineUnavailable } from './engine-health.js';
import { lockWaitSecondsFor } from './lock-wait.js';
import { killConnection, killQuery } from './recovery-prisma.js';

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_WAIT_MS = 2000;
const KILL_REPEAT_MS = 100;
export const KILL_WAIT_MS = 2000;
export const DEADLINE_MARGIN_MS = 1000;
export const RECOVERY_WAIT_MS = 2000;

export function settleDeadlineMs(options) {
  const timeoutMs = options?.timeout ?? DEFAULT_TIMEOUT_MS;
  const maxWaitMs = options?.maxWait ?? DEFAULT_MAX_WAIT_MS;
  return maxWaitMs + timeoutMs + DEADLINE_MARGIN_MS + KILL_WAIT_MS + RECOVERY_WAIT_MS;
}

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
            scope: 'query',
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
      if (!state.kills.length) return true;
      let expire;
      const expired = new Promise((resolve) => {
        expire = setTimeout(() => resolve(false), KILL_WAIT_MS);
      });
      const settled = Promise.all(state.kills).then(() => true);
      try {
        return await Promise.race([settled, expired]);
      } finally {
        clearTimeout(expire);
      }
    }
  };
}

const isExpired = (error) => error?.code === 'P2028';

function poison(connectionId, onUnavailable, log) {
  log.error(
    'A interrupção da transação vencida não foi confirmada; a conexão ficou inutilizável.',
    {
      event: 'database_connection_poisoned',
      connectionId
    }
  );
  onUnavailable('POISONED_CONNECTION');
}

async function within(promise, ms) {
  let timer;
  const expired = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ expired: true }), ms);
  });
  try {
    return await Promise.race([
      promise.then(
        (value) => ({ value }),
        (error) => ({ error })
      ),
      expired
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function discardConnection(connectionId, discard, log, onUnavailable) {
  const outcome = await within(
    Promise.resolve().then(() => discard(connectionId)),
    RECOVERY_WAIT_MS
  );
  if (!outcome.expired && !('error' in outcome)) {
    log.warn('Conexão da transação expirada encerrada no banco.', {
      event: 'database_connection_discarded',
      connectionId
    });
    return;
  }
  if ('error' in outcome)
    log.warn('Não foi possível encerrar a conexão da transação expirada.', {
      event: 'database_transaction_kill_failed',
      scope: 'connection',
      connectionId,
      causeCode: causeCodeOf(outcome.error)
    });
  log.error('A recuperação da transação expirada não foi confirmada; o processo vai reiniciar.', {
    event: 'database_recovery_unconfirmed',
    connectionId,
    reason: outcome.expired ? 'TIMEOUT' : 'REJECTED'
  });
  onUnavailable('UNCONFIRMED_RECOVERY');
}

function settleWithin(promise, deadlineMs, onExpire) {
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => reject(onExpire()), deadlineMs);
  });
  return Promise.race([promise, expired]).finally(() => clearTimeout(timer));
}

export function guardTransactions(
  client,
  {
    killQuery: interrupt = killQuery,
    killConnection: discard = killConnection,
    log = logger,
    onUnavailable = markEngineUnavailable
  } = {}
) {
  const transaction = client.$transaction;
  client.$transaction = function guardedTransaction(argument, options) {
    if (typeof argument !== 'function') return transaction.call(this, argument, options);
    const timeoutMs = options?.timeout ?? DEFAULT_TIMEOUT_MS;
    const deadlineMs = settleDeadlineMs(options);
    let connectionId = null;

    const pending = transaction
      .call(
        this,
        async (tx) => {
          const watchdog = startWatchdog(timeoutMs, interrupt, log);
          let outcome;
          try {
            await tx.$executeRawUnsafe(
              `SET SESSION innodb_lock_wait_timeout = ${lockWaitSecondsFor(timeoutMs)}`
            );
            connectionId = Number((await tx.$queryRawUnsafe('SELECT CONNECTION_ID() AS id'))[0].id);
            watchdog.state.connectionId = connectionId;
            outcome = { value: await argument(tx) };
          } catch (error) {
            outcome = { error };
          }
          if (!(await watchdog.stop())) poison(connectionId, onUnavailable, log);
          if (watchdog.state.fired) throw new TransactionDeadlineError(timeoutMs, outcome.error);
          if ('error' in outcome) throw outcome.error;
          return outcome.value;
        },
        { ...options, timeout: timeoutMs + DEADLINE_MARGIN_MS }
      )
      .catch(async (error) => {
        if (isEnginePanic(error) || isEnginePanic(error?.cause)) onUnavailable('ENGINE_PANIC');
        else if (connectionId && (isExpired(error) || isExpired(error?.cause)))
          await discardConnection(connectionId, discard, log, onUnavailable);
        throw error;
      });

    return settleWithin(pending, deadlineMs, () => {
      log.error('A transação não terminou no prazo duro; o processo vai reiniciar.', {
        event: 'database_transaction_unsettled',
        connectionId,
        timeoutMs,
        deadlineMs
      });
      onUnavailable('UNSETTLED_TRANSACTION');
      return new TransactionDeadlineError(timeoutMs);
    });
  };
  return client;
}
