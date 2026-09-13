import { describe, it, expect } from 'vitest';
import {
  createSchema,
  updateSchema,
  executionSchema,
  parse,
  assertVersion,
  changedDefinitionFields,
  definitionSnapshot,
  calculateResult,
  executionSteps,
  referenceSnapshot
} from '../../../src/modules/testCases/test-case.schema.js';
import { cursorPage, cursorWhere } from '../../../src/modules/testCases/test-case.cursor.js';
const valid = {
  title: ' Case ',
  preconditions: ' Ready ',
  expectedResult: ' Done ',
  responsibleUserId: 1,
  steps: [{ action: ' Click ', expectedResult: ' Visible ' }]
};
describe('S1-07 definition and version contract', () => {
  it('normalizes v1, defaults and order without accepting caller positions', () => {
    const value = parse(createSchema, valid);
    expect(value).toMatchObject({
      title: 'Case',
      description: null,
      status: 'ATIVO',
      requirementId: null,
      taskIds: [],
      steps: [{ action: 'Click', expectedResult: 'Visible' }]
    });
    expect(
      createSchema.safeParse({ ...valid, steps: [{ ...valid.steps[0], position: 9 }] }).success
    ).toBe(false);
  });
  it('partial updates never manufacture defaults or unlink traceability', () =>
    expect(updateSchema.parse({ status: 'INATIVO', expectedVersion: 1 })).toEqual({
      status: 'INATIVO',
      expectedVersion: 1
    }));
  it.each(['title', 'preconditions', 'expectedResult', 'responsibleUserId', 'steps'])(
    'requires %s',
    (field) => {
      const value = { ...valid };
      delete value[field];
      expect(createSchema.safeParse(value).success).toBe(false);
    }
  );
  it.each([
    { title: ' ' },
    { title: 'a'.repeat(201) },
    { description: 'a'.repeat(10001) },
    { preconditions: 'a'.repeat(20001) },
    { expectedResult: 'a'.repeat(20001) },
    { steps: [] },
    { steps: Array.from({ length: 101 }, () => valid.steps[0]) },
    { taskIds: [1, 1] },
    { taskIds: Array.from({ length: 101 }, (_, i) => i + 1) },
    { responsibleUserId: null },
    { status: 'ARQUIVADO' },
    { createdByUserId: 1 }
  ])('rejects invalid definition %j', (patch) =>
    expect(createSchema.safeParse({ ...valid, ...patch }).success).toBe(false)
  );
  it('compares normalized semantic definition, step order and task set', () => {
    const value = {
      ...parse(createSchema, valid),
      taskIds: [1, 2],
      steps: [
        { action: 'a', expectedResult: 'a' },
        { action: 'b', expectedResult: 'b' }
      ]
    };
    expect(
      changedDefinitionFields(value, {
        ...value,
        status: 'INATIVO',
        responsibleUserId: 2,
        taskIds: [2, 1]
      })
    ).toEqual([]);
    expect(
      changedDefinitionFields(value, {
        ...value,
        title: 'New',
        steps: [...value.steps].reverse(),
        requirementId: 1
      })
    ).toEqual(['title', 'requirementId', 'steps']);
  });
  it('builds a self-contained minimized v1 snapshot', () => {
    expect(
      definitionSnapshot(parse(createSchema, valid), { id: 2, title: 'Req', email: 'private' }, [
        { id: 4, title: 'Task', status: 'X' }
      ])
    ).toEqual({
      schemaVersion: 1,
      title: 'Case',
      description: null,
      preconditions: 'Ready',
      expectedResult: 'Done',
      requirement: { id: 2, title: 'Req' },
      tasks: [{ id: 4, title: 'Task' }],
      steps: [{ position: 1, action: 'Click', expectedResult: 'Visible' }]
    });
  });
  it('rejects stale expected versions with stable conflict', () =>
    expect(() => assertVersion({ currentVersion: 2 }, 1)).toThrow(
      expect.objectContaining({ statusCode: 409, code: 'TEST_CASE_VERSION_CONFLICT' })
    ));
});
const execution = {
  testCaseVersion: 1,
  environment: 'LOCAL',
  testedReference: { type: 'COMMIT', id: 1 },
  steps: [{ position: 1, result: 'PASS' }]
};
describe('S1-07 execution authority', () => {
  it.each(['result', 'executedAt', 'executedByUserId', 'createdAt'])(
    'rejects client authority %s',
    (field) =>
      expect(executionSchema.safeParse({ ...execution, [field]: 'fake' }).success).toBe(false)
  );
  it.each(['FAIL', 'BLOCKED'])('requires observation for %s', (result) => {
    expect(
      executionSchema.safeParse({
        ...execution,
        steps: [{ position: 1, result, observedResult: '  ' }]
      }).success
    ).toBe(false);
    expect(
      executionSchema.safeParse({
        ...execution,
        steps: [{ position: 1, result, observedResult: 'reason' }]
      }).success
    ).toBe(true);
  });
  it.each([
    ['PASS', 'PASS', 'PASS'],
    ['PASS', 'BLOCKED', 'BLOCKED'],
    ['FAIL', 'BLOCKED', 'FAIL']
  ])('derives %s + %s => %s', (a, b, result) =>
    expect(calculateResult([{ result: a }, { result: b }])).toBe(result)
  );
  it('rejects empty execution and references other than one typed imported entity', () => {
    expect(() => calculateResult([])).toThrow();
    for (const testedReference of [
      null,
      { type: 'ISSUE', id: 1 },
      { type: 'COMMIT', id: 1, pullRequestId: 2 }
    ])
      expect(executionSchema.safeParse({ ...execution, testedReference }).success).toBe(false);
  });
  it('copies persisted step text and requires exact positions', () => {
    const snapshot = {
      steps: [
        { position: 1, action: 'old', expectedResult: 'old expected' },
        { position: 2, action: 'next', expectedResult: 'next expected' }
      ]
    };
    const steps = [
      { position: 2, result: 'BLOCKED', observedResult: 'reason' },
      { position: 1, result: 'PASS', observedResult: null }
    ];
    expect(executionSteps(snapshot, steps)[0]).toEqual({
      position: 1,
      actionSnapshot: 'old',
      expectedResultSnapshot: 'old expected',
      result: 'PASS',
      observedResult: null
    });
    for (const submitted of [
      [steps[0]],
      [steps[0], steps[0]],
      [steps[0], { ...steps[1], position: 3 }]
    ])
      expect(() => executionSteps(snapshot, submitted)).toThrow();
  });
  it('minimizes commit snapshot and derives short hash', () =>
    expect(
      referenceSnapshot('COMMIT', {
        id: 1,
        hash: '1234567890',
        message: 'm',
        authorName: 'Name',
        authorEmail: 'private',
        date: null,
        githubUrl: null
      })
    ).toEqual({
      type: 'COMMIT',
      id: 1,
      hash: '1234567890',
      shortHash: '1234567',
      message: 'm',
      authorName: 'Name',
      date: null,
      githubUrl: null
    }));
});
describe('S1-07 cursor contract', () => {
  it('binds cursor to stream owner and deterministic date/id tuple', () => {
    const rows = [
      { id: 4, occurredAt: new Date('2026-01-01') },
      { id: 3, occurredAt: new Date('2026-01-01') }
    ];
    const page = cursorPage(rows, 1, 'occurredAt', 'history:8');
    expect(page.items).toHaveLength(1);
    expect(cursorWhere(page.nextCursor, 'occurredAt', 'history:8').OR[1].id.lt).toBe(4);
    expect(() => cursorWhere(page.nextCursor, 'occurredAt', 'history:9')).toThrow();
    expect(cursorPage(rows, 2, 'occurredAt', 'history:8').nextCursor).toBeNull();
  });
  it.each(['x', 'e30', '!!!!'])('rejects malformed cursor %s', (cursor) =>
    expect(() => cursorWhere(cursor, 'occurredAt', 'x')).toThrow()
  );
});
