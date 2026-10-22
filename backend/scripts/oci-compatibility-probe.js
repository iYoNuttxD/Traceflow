import { nativeProbe, physicalProbe } from './lib/oci-compatibility-probes.js';
import { concurrencyProbe } from './lib/oci-compatibility-concurrency.js';
import { classifyFailure, sanitizeOutput } from './lib/oci-compatibility-safety.js';

try {
  const mode = process.argv[2];
  const probes = { native: nativeProbe, physical: physicalProbe, concurrency: concurrencyProbe };
  if (!Object.hasOwn(probes, mode)) throw new Error('Use native, physical ou concurrency.');
  const result = await probes[mode]();
  process.stdout.write(
    `${JSON.stringify(result, (_, value) => (typeof value === 'bigint' ? String(value) : value))}\n`
  );
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({ code: classifyFailure(error), message: sanitizeOutput(error.message, [process.env.TEST_DATABASE_URL]) })}\n`
  );
  process.exitCode = 1;
}
