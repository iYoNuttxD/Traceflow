import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    sequence: {
      concurrent: false
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**/*.js'],
      exclude: ['src/server.js'],
      thresholds: {
        statements: 85,
        branches: 70,
        functions: 85,
        lines: 87
      }
    }
  }
});
