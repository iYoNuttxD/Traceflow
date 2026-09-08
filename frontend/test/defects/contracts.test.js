import { beforeEach, expect, it, vi } from 'vitest';
import { defectsApi } from '../../src/features/defects/api/defects.api.js';
import {
  validateDefect,
  defectPayload,
  contextualAction,
  statusReason
} from '../../src/features/defects/model/defects.js';
import { executionFormData } from '../../src/features/testCases/model/test-cases.js';
import { testCasesApi } from '../../src/features/testCases/api/test-cases.api.js';
import { defect, candidate } from './fixtures.js';
const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }));
vi.mock('../../src/api/http-client.js', () => ({ httpClient: http }));
beforeEach(() => {
  vi.resetAllMocks();
  http.get.mockResolvedValue({ data: { defect, items: [] } });
  http.post.mockResolvedValue({ data: { defect } });
  http.put.mockResolvedValue({ data: { defect } });
});
it.each([
  ['list', '/projects/1/defects'],
  ['candidates', '/projects/1/defects/detection-candidates'],
  ['history', '/defects/1/history'],
  ['retests', '/defects/1/retests']
])('reads %s with fresh bounded server parameters', async (method, url) => {
  await defectsApi[method](1, { page: 2, limit: 20, status: 'VALIDADO', search: '' });
  expect(http.get).toHaveBeenCalledWith(url, {
    fresh: true,
    params: { page: 2, limit: 20, status: 'VALIDADO' }
  });
});
it('sends every filter to server', async () => {
  const filters = {
    search: 'login',
    status: 'ABERTO',
    severity: 'ALTA',
    responsibleUserId: 7,
    requirementId: 4,
    originTaskId: 9,
    correctionTaskId: 10,
    testCaseId: 15
  };
  await defectsApi.list(1, filters);
  expect(http.get).toHaveBeenCalledWith('/projects/1/defects', { fresh: true, params: filters });
});
it.each([
  ['ABERTO', 'Gerenciar correção'],
  ['EM_CORRECAO', 'Ver correção'],
  ['AGUARDANDO_RETESTE', 'Retestar'],
  ['VALIDADO', null]
])('uses backend status %s for contextual actions', (status, label) =>
  expect(contextualAction(status)).toBe(label)
);
it('uses committed revision on edit and never resends detection or lifecycle', async () => {
  const form = {
    title: ' T ',
    description: ' D ',
    severity: 'ALTA',
    responsibleUserId: 7,
    requirementId: 4,
    originTaskIds: [9]
  };
  const payload = defectPayload(form, defect, candidate);
  expect(payload).toEqual({
    title: 'T',
    description: 'D',
    severity: 'ALTA',
    responsibleUserId: 7,
    requirementId: 4,
    originTaskIds: [9],
    expectedRevision: 1
  });
  await defectsApi.update(1, payload);
  expect(http.put).toHaveBeenCalledWith('/defects/1', payload);
});
it('keeps atomic create-and-link correction contract', async () => {
  const payload = {
    expectedRevision: 1,
    correctionCycle: 1,
    task: { title: 'Correção', requirementId: 4 }
  };
  await defectsApi.correction(1, payload);
  expect(http.post).toHaveBeenCalledWith('/defects/1/correction-tasks', payload);
});
it('does not accept orphan defects or implicit severity', () => {
  expect(
    validateDefect({
      title: 'A',
      description: 'B',
      severity: '',
      responsibleUserId: 7,
      requirementId: null,
      originTaskIds: []
    })
  ).toEqual({
    severity: 'Selecione a severidade.',
    traceability: 'Vincule o defeito a pelo menos um requisito ou uma tarefa de origem.'
  });
});
it('encodes retest concurrency explicitly while ordinary executions omit it', async () => {
  const draft = {
    testCaseVersion: 4,
    environment: 'LOCAL',
    testedReference: { id: 9, type: 'COMMIT' },
    stepResults: [{ position: 1, result: 'PASS', observedResult: '', evidences: [] }],
    evidences: []
  };
  expect(JSON.parse(executionFormData(draft).get('payload'))).not.toHaveProperty('retest');
  const retest = { defectId: 1, correctionCycle: 2, expectedRevision: 5 };
  expect(JSON.parse(executionFormData({ ...draft, retest }).get('payload')).retest).toEqual(retest);
  await testCasesApi.references(15, 'fix', {}, 1);
  expect(http.get).toHaveBeenCalledWith(
    '/test-cases/15/tested-references',
    expect.objectContaining({ params: { search: 'fix', limit: 20, retestDefectId: 1 } })
  );
});
it('explains status using server counts and validation execution', () => {
  expect(statusReason(defect)).toMatch(/Nenhuma tarefa/);
  expect(
    statusReason({ ...defect, status: 'VALIDADO', statusReason: { validatedByExecutionId: 39 } })
  ).toContain('EXEC-0039');
});
