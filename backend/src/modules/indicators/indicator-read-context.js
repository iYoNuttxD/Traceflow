import { logger } from '../../shared/logger/index.js';
import { isTransientDataSourceError } from './policies/data-source-error.policy.js';

// Owned by exactly one aggregate invocation. Rejections stay cached; no retries.
export function createIndicatorReadContext({
  asOf,
  timeZone,
  taskIds = [],
  historyIds = [],
  qualityIds = [],
  healthPeriod = null,
  requestId,
  concurrency = 2
} = {}) {
  const reads = new Map();
  const calculations = new Map();
  const queue = [];
  const warnings = new Map();
  const origins = new Map();
  let active = 0;
  const drain = () => {
    while (active < concurrency && queue.length) {
      const { key, loader, resolve, reject } = queue.shift();
      active++;
      Promise.resolve()
        .then(loader)
        .then(resolve, (error) => {
          origins.set(error, key);
          reject(error);
        })
        .finally(() => {
          active--;
          drain();
        });
    }
  };
  return {
    asOf,
    timeZone,
    taskIds,
    historyIds,
    qualityIds,
    healthPeriod,
    read(key, loader) {
      if (!reads.has(key))
        reads.set(
          key,
          new Promise((resolve, reject) => {
            queue.push({ key, loader, resolve, reject });
            drain();
          })
        );
      return reads.get(key);
    },
    existingRead(key) {
      return reads.get(key);
    },
    shareRead(key, promise) {
      // Alias the same promise: no additional loader, transaction or rejection chain.
      if (!reads.has(key)) reads.set(key, promise);
      return reads.get(key);
    },
    calculate(key, calculate) {
      if (!calculations.has(key)) calculations.set(key, calculate());
      return calculations.get(key);
    },
    unavailable(error, source) {
      if (!isTransientDataSourceError(error)) throw error;
      const origin = origins.get(error);
      if (origin)
        source =
          origin === 'taskCurrent'
            ? 'tasks'
            : origin === 'requirementProjection'
              ? 'traceability'
              : origin.startsWith('github')
                ? 'github'
                : origin.startsWith('quality:')
                  ? 'quality'
                  : ['taskHistory', 'activity', 'sprints'].includes(origin)
                    ? origin
                    : source;
      if (!warnings.has(source)) {
        warnings.set(source, { code: 'SOURCE_UNAVAILABLE', source });
        logger.warn('Indicator source unavailable', {
          source,
          errorCode: error.code ?? error.name,
          requestId
        });
      }
    },
    warnings() {
      return [...warnings.values()];
    }
  };
}
