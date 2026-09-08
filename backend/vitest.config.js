import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.js'],
    globalSetup: ['./test/global-setup.js'],
    env: {
      NODE_ENV: 'test',
      RATE_LIMIT_MAX: '1000',
      SENSITIVE_RATE_LIMIT_MAX: '1000',
      RATE_LIMIT_AUTH_MAX: '1000',
      RATE_LIMIT_EMAIL_MAX: '1000',
      RATE_LIMIT_SENSITIVE_MAX: '1000'
    },
    fileParallelism: false,
    testTimeout: 30000,
    sequence: {
      hooks: 'stack',
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
