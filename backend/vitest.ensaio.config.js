import { defineConfig } from 'vitest/config';
import { sharedTestOptions } from './vitest.config.js';

// This remains an opt-in volume run; never inherit the main suite's projects.
export default defineConfig({
  test: {
    ...sharedTestOptions,
    include: ['test/ensaios/**/*.ensaio.js'],
    testTimeout: 900_000,
    hookTimeout: 300_000,
    coverage: { enabled: false }
  }
});
