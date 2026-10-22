import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config.js';

export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ['test/ensaios/**/*.ensaio.js'],
      testTimeout: 900_000,
      hookTimeout: 300_000,
      coverage: { enabled: false }
    }
  })
);
