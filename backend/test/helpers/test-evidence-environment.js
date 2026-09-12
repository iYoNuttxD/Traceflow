import { mkdtempSync, mkdirSync, realpathSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, isAbsolute, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

// One owner per isolated Vitest file/worker, before application imports. Never adopt
// a caller's storage directory: it may contain development or production evidence.
export function createTestEvidenceEnvironment(
  environment = process.env,
  parentDirectory = tmpdir()
) {
  const parent = realpathSync(parentDirectory);
  const owner = mkdtempSync(join(parent, 'traceflow-test-evidence-'));
  const root = join(owner, 'evidence');
  const marker = join(owner, '.traceflow-test-evidence-owner');
  const token = randomUUID();
  mkdirSync(root, { mode: 0o700 });
  writeFileSync(marker, token, { flag: 'wx', mode: 0o600 });
  environment.TEST_EVIDENCE_STORAGE_DIR = root;

  function assertRoot() {
    if (
      environment.TEST_EVIDENCE_STORAGE_DIR !== root ||
      !isAbsolute(root) ||
      dirname(owner) !== parent ||
      realpathSync(owner) !== owner ||
      realpathSync(root) !== root ||
      realpathSync(marker) !== marker ||
      readFileSync(marker, 'utf8') !== token
    )
      throw new Error('Test evidence ownership check failed; cleanup refused.');
    return root;
  }

  return {
    root,
    owner,
    assertRoot,
    cleanup() {
      assertRoot();
      rmSync(owner, { recursive: true });
    }
  };
}

let current;
export function configureTestEvidenceEnvironment(parentDirectory) {
  current ??= createTestEvidenceEnvironment(process.env, parentDirectory);
  return current;
}
export function assertTestEvidenceRoot() {
  if (!current) throw new Error('Test evidence environment has not been configured.');
  return current.assertRoot();
}
