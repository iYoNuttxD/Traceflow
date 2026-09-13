import { createTestEvidenceEnvironment } from './helpers/test-evidence-environment.js';

export default function setup(project) {
  // This parent belongs to one Vitest invocation. Each isolated suite gets its
  // own child; teardown also reclaims children from entirely skipped suites.
  const owner = createTestEvidenceEnvironment({});
  project.provide('testEvidenceParent', owner.root);
  return () => owner.cleanup();
}
