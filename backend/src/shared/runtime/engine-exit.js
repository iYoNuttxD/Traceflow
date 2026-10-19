import { isEngineHealthy, onEngineUnavailable } from '../../database/engine-health.js';

export const ENGINE_UNAVAILABLE = 'ENGINE_UNAVAILABLE';

export const exitCodeFor = (code, healthy = isEngineHealthy) => (healthy() ? code : 1);

export function stopWhenEngineUnavailable(stop, { logger, subscribe = onEngineUnavailable }) {
  return subscribe((reason) => {
    logger.error(
      'O banco ficou indisponível para este processo; ele vai encerrar para reiniciar.',
      {
        event: 'database_unavailable_shutdown',
        reason
      }
    );
    void stop(ENGINE_UNAVAILABLE);
  });
}
