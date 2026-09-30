import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createTestEvidenceEnvironment } from './helpers/test-evidence-environment.js';

export default function setup(project) {
  // This parent belongs to one Vitest invocation. Each isolated suite gets its
  // own child; teardown also reclaims children from entirely skipped suites.
  const owner = createTestEvidenceEnvironment({});
  project.provide('testEvidenceParent', owner.root);
  // Only sequential suites may share a deployment marker. Each invocation owns
  // a fresh directory, so filtered runs still deploy and stale runs cannot skip.
  // Watch reruns retain globalSetup; never cache there after migrations may change.
  if (project.config?.fileParallelism === false && !project.config.watch) {
    const migrations = join(owner.root, 'migrations');
    mkdirSync(migrations, { mode: 0o700 });
    project.provide('testMigrationCache', migrations);
  }
  return () => owner.cleanup();
}
