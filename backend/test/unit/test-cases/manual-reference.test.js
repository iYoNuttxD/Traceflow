import { describe, expect, it, vi } from 'vitest';
import {
  executionSchema,
  referenceSnapshot
} from '../../../src/modules/testCases/test-case.schema.js';
import {
  caseDetail,
  executionSummary
} from '../../../src/modules/testCases/test-case.presenter.js';

vi.mock('../../../src/shared/logger/index.js', () => ({ logger: { error: vi.fn() } }));
vi.mock('../../../src/modules/testCases/repositories/test-case.repository.js', () => ({
  testCaseRepository: {}
}));
vi.mock('../../../src/modules/testCases/repositories/test-execution.repository.js', () => ({
  testExecutionRepository: {}
}));
vi.mock('../../../src/modules/testCases/storage/local-test-evidence.storage.js', () => ({
  testEvidenceStorage: {}
}));
vi.mock('../../../src/modules/testCases/services/test-case.service.js', () => ({
  authorize: vi.fn(async () => ({ user: { name: 'Tester' } })),
  audit: vi.fn(() => ({}))
}));
vi.mock('../../../src/modules/defects/defect-retest.service.js', () => ({
  prepareDefectRetest: vi.fn(async () => ({ id: 9 })),
  completeDefectRetest: vi.fn()
}));
import { createTestExecutionService } from '../../../src/modules/testCases/services/test-execution.service.js';
import { completeDefectRetest } from '../../../src/modules/defects/defect-retest.service.js';

const input = {
  testCaseVersion: 1,
  environment: 'LOCAL',
  testedReference: { type: 'MANUAL', version: ' release 1 ' },
  steps: [{ position: 1, result: 'PASS' }]
};
const snapshot = { steps: [{ position: 1, action: 'Open', expectedResult: 'Visible' }] };
function fixture(integration = null) {
  let recorded;
  const row = { id: 1, projectId: 2, currentVersion: 1, status: 'ATIVO' };
  const tx = {
    lockProject: vi.fn(),
    lock: vi.fn(async () => row),
    project: vi.fn(async () => ({ id: 2, githubIntegration: integration })),
    currentVersion: vi.fn(async () => ({ id: 3, snapshotJson: snapshot })),
    audit: vi.fn(),
    defects: {},
    executions: {
      reference: vi.fn(async () => ({ id: 4, number: 44, title: 'PR' })),
      create: vi.fn(async (data, steps) => {
        recorded = { id: 5, ...data, steps, evidence: [], version: { snapshotJson: snapshot } };
        return recorded;
      }),
      find: vi.fn(async () => recorded)
    }
  };
  const cases = { find: vi.fn(async () => row), transaction: vi.fn(async (work) => work(tx)) };
  const storage = { prepare: vi.fn(async () => []), cleanup: vi.fn() };
  const service = createTestExecutionService({ cases, storage, executions: {} });
  return { tx, cases, storage, service };
}

describe('explicit standalone execution reference', () => {
  it('requires a bounded nonempty version and rejects fabricated IDs or imported metadata', () => {
    expect(executionSchema.parse(input).testedReference).toEqual({
      type: 'MANUAL',
      version: 'release 1'
    });
    for (const testedReference of [
      undefined,
      null,
      { type: 'MANUAL' },
      { type: 'MANUAL', version: ' ' },
      { type: 'MANUAL', version: 'a'.repeat(201) },
      { type: 'MANUAL', version: 'v1', id: 1 },
      { type: 'COMMIT', id: 1, version: 'v1' }
    ])
      expect(executionSchema.safeParse({ ...input, testedReference }).success).toBe(false);
  });
  it('minimizes manual snapshots and preserves historical display after integration changes', () => {
    const ref = referenceSnapshot('MANUAL', { version: 'v1', id: 99, githubUrl: 'ignored' });
    expect(ref).toEqual({ type: 'MANUAL', version: 'v1' });
    expect(executionSummary({ id: 5, testedReferenceSnapshot: ref }).testedReference).toEqual(ref);
  });
  it('advertises manual execution only to active-case writers in standalone projects', () => {
    const row = {
      id: 1,
      status: 'ATIVO',
      project: { githubIntegration: null },
      steps: [],
      taskLinks: [],
      executions: []
    };
    expect(caseDetail(row, 'MEMBER').capabilities.canUseManualReference).toBe(true);
    expect(caseDetail(row, 'VIEWER').capabilities.canUseManualReference).toBe(false);
    expect(
      caseDetail({ ...row, status: 'INATIVO' }, 'OWNER').capabilities.canUseManualReference
    ).toBe(false);
    expect(
      caseDetail({ ...row, project: { githubIntegration: { id: 7 } } }, 'OWNER').capabilities
        .canUseManualReference
    ).toBe(false);
  });
  it('records immutable manual metadata without a GitHub lookup or foreign key', async () => {
    const f = fixture();
    const result = await f.service.record(1, input, {}, { actorUserId: 7 });
    expect(result).toMatchObject({
      testedReferenceType: 'MANUAL',
      testedPullRequestId: null,
      testedCommitId: null,
      testedReferenceSnapshot: { type: 'MANUAL', version: 'release 1' },
      result: 'PASS'
    });
    expect(f.tx.executions.reference).not.toHaveBeenCalled();
    expect(f.tx.lockProject.mock.invocationCallOrder[0]).toBeLessThan(
      f.tx.project.mock.invocationCallOrder[0]
    );
    expect(f.storage.cleanup).toHaveBeenCalledWith({}, { committed: true });
  });
  it('rechecks integration under the project lock and rejects stale local capabilities', async () => {
    const f = fixture({ id: 7 });
    await expect(f.service.record(1, input, {}, { actorUserId: 7 })).rejects.toMatchObject({
      statusCode: 409,
      code: 'TEST_EXECUTION_MANUAL_REFERENCE_UNAVAILABLE'
    });
    expect(f.tx.executions.create).not.toHaveBeenCalled();
    expect(f.storage.cleanup).toHaveBeenCalledWith({}, { committed: false });
  });
  it('preserves same-project imported-reference lookup', async () => {
    const f = fixture({ id: 7 });
    await f.service.record(
      1,
      { ...input, testedReference: { type: 'PULL_REQUEST', id: 4 } },
      {},
      { actorUserId: 7 }
    );
    expect(f.tx.executions.reference).toHaveBeenCalledWith(2, 'PULL_REQUEST', 4);
    f.tx.executions.reference.mockResolvedValue(null);
    await expect(
      f.service.record(
        1,
        { ...input, testedReference: { type: 'COMMIT', id: 99 } },
        {},
        { actorUserId: 7 }
      )
    ).rejects.toMatchObject({ statusCode: 404 });
  });
  it('passes manual retests through the existing defect lifecycle', async () => {
    const f = fixture();
    await f.service.record(
      1,
      { ...input, retest: { defectId: 9, correctionCycle: 1, expectedRevision: 1 } },
      {},
      { actorUserId: 7 }
    );
    expect(completeDefectRetest).toHaveBeenCalledWith(
      f.tx.defects,
      { id: 9 },
      expect.objectContaining({ testedReferenceType: 'MANUAL', result: 'PASS' }),
      { actorUserId: 7 }
    );
  });
});
