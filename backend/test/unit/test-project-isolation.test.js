import { existsSync, globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { defaultExclude, defaultInclude } from 'vitest/config';
import config, { sharedTestOptions } from '../../vitest.config.js';
import ensaio from '../../vitest.ensaio.config.js';
import setup from '../global-setup.js';
import { createTestEvidenceEnvironment } from '../helpers/test-evidence-environment.js';

const backend = fileURLToPath(new URL('../../', import.meta.url));
const projects = config.test.projects.map((project) => project.test);
const unit = projects.find((project) => project.name === 'unit');
const database = projects.find((project) => project.name === 'database');
const discover = ({ include = defaultInclude, exclude = defaultExclude }) =>
  globSync(include, { cwd: backend, exclude })
    .map((path) => path.replaceAll('\\', '/'))
    .sort();

describe('isolated backend test projects', () => {
  it('partitions every default-discovered suite exactly once, including conformance', () => {
    const original = discover({});
    const units = discover(unit);
    const databaseSuites = discover(database);
    expect(original.length).toBeGreaterThan(0);
    expect(units.length).toBeGreaterThan(0);
    expect(databaseSuites.length).toBeGreaterThan(0);
    expect([...units, ...databaseSuites].sort()).toEqual(original);
    expect(new Set([...units, ...databaseSuites]).size).toBe(original.length);
    expect(units.every((path) => path.startsWith('test/unit/'))).toBe(true);
    expect(databaseSuites.some((path) => path.startsWith('test/unit/'))).toBe(false);
    for (const directory of ['api', 'integration', 'conformance'])
      expect(databaseSuites.some((path) => path.startsWith(`test/${directory}/`))).toBe(true);
  });

  it('runs two isolated unit workers before the single database worker', () => {
    expect(projects).toHaveLength(2);
    expect(unit).toMatchObject({
      fileParallelism: true,
      maxWorkers: 2,
      sequence: { groupOrder: 0 }
    });
    expect(database).toMatchObject({
      fileParallelism: false,
      maxWorkers: 1,
      sequence: { groupOrder: 1 }
    });
    for (const project of projects) {
      expect(project).toMatchObject({
        environment: 'node',
        pool: 'forks',
        isolate: true,
        setupFiles: ['./test/setup.js'],
        globalSetup: ['./test/global-setup.js'],
        testTimeout: 30000,
        sequence: { hooks: 'stack', concurrent: false }
      });
      expect(project.env).toEqual(sharedTestOptions.env);
      expect(project.env.NODE_ENV).toBe('test');
    }
    expect(config.test.globalSetup).toBeUndefined();
  });

  it('keeps one coverage union and every existing threshold and source boundary', () => {
    expect(config.test.coverage).toEqual({
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**/*.js'],
      exclude: ['src/server.js'],
      thresholds: { statements: 85, branches: 70, functions: 85, lines: 87 }
    });
    for (const project of projects) expect(project.coverage).toBeUndefined();
  });

  it('gives both projects independent evidence ownership and only serial files a migration cache', () => {
    const contexts = projects.map((project) => {
      const provided = {};
      const cleanup = setup({
        config: { ...project, watch: false },
        provide: (key, value) => {
          provided[key] = value;
        }
      });
      return { provided, cleanup };
    });
    try {
      const [unitContext, databaseContext] = contexts.map(({ provided }) => provided);
      expect(unitContext.testEvidenceParent).not.toBe(databaseContext.testEvidenceParent);
      expect(unitContext.testMigrationCache).toBeUndefined();
      expect(existsSync(databaseContext.testMigrationCache)).toBe(true);
      const first = createTestEvidenceEnvironment({}, unitContext.testEvidenceParent);
      const second = createTestEvidenceEnvironment({}, databaseContext.testEvidenceParent);
      try {
        expect(first.root).not.toBe(second.root);
        first.cleanup();
        expect(second.assertRoot()).toBe(second.root);
      } finally {
        if (existsSync(first.owner)) first.cleanup();
        second.cleanup();
      }
    } finally {
      for (const context of contexts.reverse()) context.cleanup();
    }
  });

  it('keeps the volume configuration standalone and outside the main suite', () => {
    expect(ensaio.test.projects).toBeUndefined();
    expect(ensaio.test).toMatchObject({
      fileParallelism: false,
      maxWorkers: 1,
      isolate: true,
      setupFiles: ['./test/setup.js'],
      globalSetup: ['./test/global-setup.js'],
      include: ['test/ensaios/**/*.ensaio.js'],
      testTimeout: 900_000,
      hookTimeout: 300_000,
      coverage: { enabled: false }
    });
    const volumes = discover(ensaio.test);
    expect(volumes.length).toBeGreaterThan(0);
    expect(volumes.every((path) => path.startsWith('test/ensaios/'))).toBe(true);
    const main = new Set(projects.flatMap(discover));
    expect(volumes.some((path) => main.has(path))).toBe(false);
  });
});
