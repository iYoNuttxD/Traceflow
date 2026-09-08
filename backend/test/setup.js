import { afterAll, inject } from 'vitest';
import { configureTestEvidenceEnvironment } from './helpers/test-evidence-environment.js';

const evidence = configureTestEvidenceEnvironment(inject('testEvidenceParent'));
// Registered before suite hooks; Vitest's stack order closes HTTP servers first.
afterAll(() => evidence.cleanup());
