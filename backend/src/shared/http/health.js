import { env } from '../../config/env.js';
import { checkDatabaseReadiness } from '../../database/readiness.js';

export function createReadinessCheck({
  configuration = env,
  databaseCheck = checkDatabaseReadiness,
  storageCheck = async () => true,
  lifecycle,
  timeoutMs = configuration.readinessTimeoutMs
} = {}) {
  let pending;
  return function checkReadiness() {
    if (!configuration.configurationValid || (lifecycle && !lifecycle.isReady()))
      return Promise.resolve(false);
    // A timed-out Prisma query cannot be safely cancelled individually. Keep one in flight
    // until it settles; probes must not pile up queries or disconnect the shared Client.
    if (!pending) {
      let timer;
      const work = Promise.resolve()
        .then(async () => {
          if (!(await storageCheck())) return false;
          return Boolean(await databaseCheck());
        })
        .catch(() => false);
      pending = Promise.race([
        work,
        new Promise((resolve) => {
          timer = setTimeout(() => resolve(false), timeoutMs);
        })
      ]).then((ready) => ready && (!lifecycle || lifecycle.isReady()));
      void work.then(() => {
        clearTimeout(timer);
        pending = undefined;
      });
    }
    return pending;
  };
}

export const checkReadiness = createReadinessCheck();

export function createHealthHandlers({ readinessCheck = checkReadiness } = {}) {
  return Object.freeze({
    health(req, res) {
      return res.json({ status: 'ok', message: 'TRACEFLOW backend structure is ready.' });
    },
    live(req, res) {
      return res.json({ status: 'ok' });
    },
    async ready(req, res) {
      res.setHeader('Cache-Control', 'no-store');
      try {
        if (!(await readinessCheck())) throw new Error('not ready');
        return res.json({ status: 'ready' });
      } catch {
        return res
          .status(503)
          .json({ status: 'not_ready', message: 'Dependência essencial indisponível.' });
      }
    }
  });
}
