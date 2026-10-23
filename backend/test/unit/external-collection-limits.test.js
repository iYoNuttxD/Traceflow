import { describe, expect, it } from 'vitest';
import { replaceRequirementTasksBodySchema } from '../../src/modules/requirements/requirement.validation.js';
import { replaceSprintTasksBodySchema } from '../../src/modules/sprints/sprint.validation.js';
import { SPRINT_MAX_TASKS } from '../../src/modules/sprints/sprint.schema.js';
import {
  createSchema as testCaseSchema,
  executionSchema,
  LIMITS
} from '../../src/modules/testCases/test-case.schema.js';
import { createSchema as defectSchema } from '../../src/modules/defects/defect.schema.js';
import { dashboardWidgetsSchema } from '../../src/modules/indicators/indicators.validation.js';
import { INDICATORS } from '../../src/modules/indicators/indicators.catalog.js';
import {
  DASHBOARD_WIDGET_LIMIT,
  isCustomizable
} from '../../src/modules/indicators/personalized-dashboard.catalog.js';
import { manifest } from '../../src/modules/testCases/uploads/upload-contract.js';
import { evidenceLimits } from '../../src/modules/testCases/storage/test-evidence.validation.js';

const ids = (count) => Array.from({ length: count }, (_, index) => index + 1);
const step = { action: 'Ação sintética', expectedResult: 'Resultado sintético' };
const widgets = Object.keys(INDICATORS).filter(isCustomizable);

// Check actual public request schemas, including their transforms/refinements, rather than
// validating synthetic Zod examples. Payload-size enforcement is covered by security.test.js.
describe('finite external collection budgets after the Zod security update', () => {
  it.each([
    ['requirement tasks', replaceRequirementTasksBodySchema.shape.taskIds, 100, ids],
    ['sprint tasks', replaceSprintTasksBodySchema.shape.taskIds, SPRINT_MAX_TASKS, ids],
    ['test case tasks', testCaseSchema.shape.taskIds, LIMITS.tasks, ids],
    ['test case steps', testCaseSchema.shape.steps, LIMITS.steps, (n) => Array(n).fill(step)],
    [
      'execution steps',
      executionSchema.shape.steps,
      LIMITS.steps,
      (n) => ids(n).map((position) => ({ position, result: 'PASS' }))
    ],
    ['defect origins', defectSchema.shape.originTaskIds, 100, ids],
    [
      'dashboard widgets',
      dashboardWidgetsSchema,
      DASHBOARD_WIDGET_LIMIT,
      (n) => widgets.slice(0, n)
    ]
  ])('%s accepts its boundary and rejects one item beyond it', (_name, schema, max, values) => {
    expect(schema.safeParse(values(max)).success).toBe(true);
    const result = schema.safeParse(values(max + 1));
    expect(result.success).toBe(false);
    expect(result.error.issues.some((issue) => issue.code === 'too_big')).toBe(true);
  });

  it('rejects an oversized upload manifest before processing individual files', () => {
    const limits = evidenceLimits({});
    expect(() => manifest({ files: Array(limits.files + 1).fill(null) }, limits)).toThrow(
      'Muitas evidências.'
    );
    const files = Array.from({ length: limits.files }, (_, i) => ({
      field: `stepEvidence.${i + 1}`,
      name: 'fixture.png',
      sizeBytes: 1,
      sha256: 'a'.repeat(64)
    }));
    expect(
      manifest(
        { idempotencyKey: '12345678-1234-4123-8123-123456789abc', testCaseVersion: 1, files },
        limits
      ).files
    ).toHaveLength(limits.files);
  });
});
