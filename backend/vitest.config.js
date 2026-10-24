import { defaultExclude, defaultInclude, defineConfig } from 'vitest/config';

// Each project owns setup and teardown. A root globalSetup would also run and
// leak its provided migration marker into the parallel project.
export const sharedTestOptions = {
  environment: 'node',
  pool: 'forks',
  isolate: true,
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
  maxWorkers: 1,
  testTimeout: 30000,
  sequence: {
    hooks: 'stack',
    concurrent: false
  }
};

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          ...sharedTestOptions,
          name: 'unit',
          include: defaultInclude.map((pattern) => `test/unit/${pattern}`),
          exclude: [...defaultExclude],
          fileParallelism: true,
          maxWorkers: 2,
          sequence: { ...sharedTestOptions.sequence, groupOrder: 0 }
        }
      },
      {
        test: {
          ...sharedTestOptions,
          name: 'database',
          include: [...defaultInclude],
          exclude: [...defaultExclude, 'test/unit/**'],
          // All suites sharing TEST_DATABASE_URL remain in one serial group.
          // Run it after the unit group, without competing CPU/pool activity.
          sequence: { ...sharedTestOptions.sequence, groupOrder: 1 }
        }
      }
    ],
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
