import { describe, it, expect } from 'vitest';
import {
  correctionProjection,
  createSchema,
  updateSchema,
  correctionSchema,
  retestSchema,
  listSchema,
  requireTraceability
} from '../../../src/modules/defects/defect.schema.js';
const input = {
  title: 'Defect',
  description: 'Observed mismatch',
  severity: 'ALTA',
  responsibleUserId: 1,
  detectedExecutionStepId: 1,
  requirementId: 2
};
describe('S1-08 domain contracts', () => {
  it.each([
    [[], 'ABERTO'],
    [['A_FAZER'], 'ABERTO'],
    [['A_FAZER', 'A_FAZER'], 'ABERTO'],
    [['CONCLUIDO'], 'AGUARDANDO_RETESTE'],
    [['CONCLUIDO', 'CONCLUIDO'], 'AGUARDANDO_RETESTE'],
    [['A_FAZER', 'CONCLUIDO'], 'EM_CORRECAO'],
    [['EM_ANDAMENTO'], 'EM_CORRECAO'],
    [['EM_ANDAMENTO', 'CONCLUIDO'], 'EM_CORRECAO']
  ])('projects correction task statuses %j', (statuses, status) =>
    expect(correctionProjection(statuses.map((status) => ({ status }))).status).toBe(status)
  );
  it('keeps explicit validation and reports counts', () =>
    expect(correctionProjection([{ status: 'A_FAZER' }], 27)).toEqual({
      status: 'VALIDADO',
      statusReason: {
        correctionTasksTotal: 1,
        todo: 1,
        inProgress: 0,
        done: 0,
        validatedByExecutionId: 27
      }
    }));
  it.each(['status', 'openedAt', 'currentCorrectionCycle', 'projectId', 'revision'])(
    'rejects client-controlled %s',
    (key) => expect(createSchema.safeParse({ ...input, [key]: 1 }).success).toBe(false)
  );
  it.each([
    { severity: 'URGENTE' },
    { title: ' ' },
    { responsibleUserId: null },
    { originTaskIds: [1, 1] },
    { originTaskIds: Array.from({ length: 101 }, (_, i) => i + 1) },
    { requirementId: [1, 2] }
  ])('rejects invalid cardinality/fields %j', (patch) =>
    expect(createSchema.safeParse({ ...input, ...patch }).success).toBe(false)
  );
  it('enforces traceability without inventing links', () => {
    expect(() => requireTraceability(null, [])).toThrow();
    expect(() => requireTraceability(1, [])).not.toThrow();
    expect(() => requireTraceability(null, [1])).not.toThrow();
  });
  it('requires revision for edit and context for retest', () => {
    expect(updateSchema.safeParse({ title: 'X' }).success).toBe(false);
    expect(retestSchema.safeParse({ defectId: 1, correctionCycle: 1 }).success).toBe(false);
  });
  it.each([{ taskId: 1, task: { title: 'X' } }, {}, { task: { title: 'X', status: 'CONCLUIDO' } }])(
    'requires exactly one canonical correction task mode %j',
    (patch) =>
      expect(
        correctionSchema.safeParse({ expectedRevision: 1, correctionCycle: 1, ...patch }).success
      ).toBe(false)
  );
  it('bounds pagination', () => {
    expect(listSchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(listSchema.safeParse({ page: 0 }).success).toBe(false);
  });
});
