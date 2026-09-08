import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LIMITS,
  EVIDENCE_LIMITS,
  evidenceError,
  validateForm,
  definitionPayload,
  executionFormData,
  referenceOption,
  mergeItems,
  resultOf
} from '../../src/features/testCases/model/test-cases.js';
import { testCasesApi } from '../../src/features/testCases/api/test-cases.api.js';
const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }));
vi.mock('../../src/api/http-client.js', () => ({ httpClient: http }));
const form = {
  title: ' Caso ',
  description: '',
  preconditions: 'Pré',
  expectedResult: 'Resultado',
  status: 'ATIVO',
  responsibleUserId: '7',
  requirementId: '',
  taskIds: [],
  steps: [{ id: 'draft-1', action: 'Ação', expectedResult: 'Resultado' }]
};
beforeEach(() => {
  vi.resetAllMocks();
  http.get.mockResolvedValue({ data: { items: [], testCase: { id: 1 }, execution: { id: 3 } } });
  http.post.mockResolvedValue({ data: { testCase: { id: 1 }, execution: { id: 3 } } });
  http.put.mockResolvedValue({ data: { testCase: { id: 1 } } });
});
describe('S1-07 API and payload contracts', () => {
  it('omits empty filters, keeps numerical pagination and marks fresh reads', async () => {
    await testCasesApi.list(4, { search: '', status: 'ATIVO', page: 2, limit: 20, taskId: null });
    expect(http.get).toHaveBeenCalledWith('/projects/4/test-cases', {
      params: { status: 'ATIVO', page: 2, limit: 20 },
      fresh: true
    });
  });
  it('sends definition without draft IDs, actor or currentVersion', async () => {
    const payload = definitionPayload(form, 3);
    expect(payload).toEqual({
      title: 'Caso',
      description: null,
      preconditions: 'Pré',
      expectedResult: 'Resultado',
      status: 'ATIVO',
      responsibleUserId: 7,
      requirementId: null,
      taskIds: [],
      steps: [{ action: 'Ação', expectedResult: 'Resultado' }],
      expectedVersion: 3
    });
    await testCasesApi.create(4, definitionPayload(form));
    await testCasesApi.update(1, payload);
    await testCasesApi.remove(1);
    expect(http.post).toHaveBeenCalledWith(
      '/projects/4/test-cases',
      expect.not.objectContaining({ expectedVersion: expect.anything() })
    );
    expect(http.put).toHaveBeenCalledWith('/test-cases/1', payload);
    expect(http.delete).toHaveBeenCalledWith('/test-cases/1');
  });
  it('builds exact multipart fields and leaves Content-Type/boundary to the client', async () => {
    const file = new File(['{}'], 'file.json', { type: 'application/json' });
    const body = executionFormData({
      testCaseVersion: 3,
      environment: 'LOCAL',
      testedReference: referenceOption({
        id: 9,
        type: 'COMMIT',
        shortHash: 'abcd',
        message: 'Fix'
      }),
      stepResults: [{ position: 1, result: 'PASS', observedResult: '', evidences: [] }],
      evidences: [{ file }]
    });
    expect(JSON.parse(body.get('payload'))).toEqual({
      testCaseVersion: 3,
      environment: 'LOCAL',
      testedReference: { id: 9, type: 'COMMIT' },
      steps: [{ position: 1, result: 'PASS', observedResult: null }]
    });
    await testCasesApi.record(1, body);
    expect(http.post).toHaveBeenCalledWith('/test-cases/1/executions', body, { timeout: 120000 });
  });
  it('downloads only through authenticated blob transport', async () => {
    const signal = new AbortController().signal;
    await testCasesApi.content(33, { signal });
    expect(http.get).toHaveBeenCalledWith('/test-evidence/33/content', {
      signal,
      responseType: 'blob',
      fresh: true
    });
  });
  it.each([
    ['detail', '/test-cases/2'],
    ['execution', '/test-executions/2'],
    ['versions', '/test-cases/2/versions'],
    ['history', '/test-cases/2/history'],
    ['executions', '/test-cases/2/executions']
  ])('reads %s from its dedicated endpoint', async (method, path) => {
    await testCasesApi[method](2);
    expect(http.get).toHaveBeenCalledWith(path, expect.objectContaining({ fresh: true }));
  });
  it('uses bounded imported-reference search', async () => {
    await testCasesApi.references(2, 'fix');
    expect(http.get).toHaveBeenCalledWith('/test-cases/2/tested-references', {
      fresh: true,
      params: { search: 'fix', limit: 20 }
    });
  });
});
describe('server-aligned client validation', () => {
  it.each(['title', 'description', 'preconditions', 'expectedResult'])(
    'enforces %s length',
    (key) => {
      expect(validateForm({ ...form, [key]: 'x'.repeat(LIMITS[key] + 1) })).toHaveProperty(key);
    }
  );
  it('requires responsible and step text, preserves optional traceability', () => {
    expect(validateForm(form)).toEqual({});
    expect(
      validateForm({
        ...form,
        responsibleUserId: '',
        steps: [{ id: 'a', action: '', expectedResult: '' }]
      })
    ).toEqual({
      responsibleUserId: 'Selecione um membro ativo.',
      'a-action': 'Campo obrigatório.',
      'a-expectedResult': 'Campo obrigatório.'
    });
  });
  it.each([
    ['png', 'image/png'],
    ['jpg', 'image/jpeg'],
    ['jpeg', 'image/jpeg'],
    ['webp', 'image/webp'],
    ['mp4', 'video/mp4'],
    ['webm', 'video/webm'],
    ['mov', 'video/quicktime']
  ])('accepts step %s with canonical MIME', (ext, type) => {
    expect(evidenceError([], [new File(['x'], `file.${ext}`, { type })], true, 0)).toBe('');
  });
  it.each([
    ['pdf', 'application/pdf'],
    ['txt', 'text/plain'],
    ['log', 'text/plain'],
    ['json', 'application/json']
  ])('accepts general %s and rejects it on a step', (ext, type) => {
    const file = new File(['x'], `file.${ext}`, { type });
    expect(evidenceError([], [file], false, 0)).toBe('');
    expect(evidenceError([], [file], true, 0)).toMatch(/Formato/);
  });
  it('checks MIME, empty files, inclusive binary sizes and video size separately', () => {
    const file = (name, size, type = '') => ({ name, size, type });
    expect(evidenceError([], [file('x.png', 1, 'text/html')], true, 0)).toMatch(/Formato/);
    expect(evidenceError([], [file('x.png', 0)], true, 0)).toMatch(/vazio/);
    expect(evidenceError([], [file('x.png', EVIDENCE_LIMITS.fileBytes)], true, 0)).toBe('');
    expect(evidenceError([], [file('x.png', EVIDENCE_LIMITS.fileBytes + 1)], true, 0)).toMatch(
      /limite/
    );
    expect(evidenceError([], [file('x.mp4', EVIDENCE_LIMITS.videoBytes)], true, 0)).toBe('');
    expect(evidenceError([], [file('x.mp4', EVIDENCE_LIMITS.videoBytes + 1)], true, 0)).toMatch(
      /limite/
    );
  });
  it('enforces per-step/general/execution counts and aggregate bytes', () => {
    const file = { name: 'x.png', size: 1 };
    expect(evidenceError([], [file], true, 3)).toMatch(/3 arquivos/);
    expect(evidenceError([], [file], false, 5)).toMatch(/5 arquivos/);
    expect(evidenceError(Array(20).fill(file), [file], false, 0)).toMatch(/20 arquivos/);
    expect(evidenceError([{ size: EVIDENCE_LIMITS.totalBytes }], [file], false, 0)).toMatch(
      /100 MiB/
    );
  });
  it('previews result precedence without replacing server authority and deduplicates IDs', () => {
    expect(resultOf([{ result: 'BLOCKED' }, { result: 'FAIL' }])).toBe('FAIL');
    expect(resultOf([{ result: 'BLOCKED' }])).toBe('BLOCKED');
    expect(resultOf([{ result: '' }])).toBe('PENDING');
    expect(resultOf([{ result: 'PASS' }])).toBe('PASS');
    expect(mergeItems([{ id: 1, title: 'old' }], [{ id: 1, title: 'new' }, { id: 2 }])).toEqual([
      { id: 1, title: 'new' },
      { id: 2 }
    ]);
  });
});
