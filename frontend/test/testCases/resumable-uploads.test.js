import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  recordResumable,
  fileChecksum,
  retryUpload,
  resumableUploadsApi
} from '../../src/features/testCases/api/resumable-uploads.api.js';
import { createHash } from 'node:crypto';
const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }));
vi.mock('../../src/api/http-client.js', () => ({ httpClient: http }));
const hash = (value) => createHash('sha256').update(value).digest('hex');
function fixture({ large = false, multiple = false } = {}) {
  const content = large ? 'x'.repeat(8388608 + 1) : '{"ok":true}';
  const files = [{ field: 'evidence', file: new File([content], 'result.json'), content }];
  if (multiple)
    files.push({ field: 'stepEvidence.1', file: new File(['png'], 'shot.png'), content: 'png' });
  const form = new FormData();
  form.append(
    'payload',
    JSON.stringify({
      testCaseVersion: 1,
      environment: 'LOCAL',
      testedReference: { type: 'PULL_REQUEST', id: 1 },
      steps: [{ position: 1, result: 'PASS' }]
    })
  );
  for (const item of files) form.append(item.field, item.file);
  let session = {
    uploadId: 'session',
    sessionStatus: 'OPEN',
    chunkSize: 8388608,
    testCaseVersion: 1,
    expiresAt: '2099-01-01T00:00:00Z',
    confirmedBytes: 0,
    totalBytes: files.reduce((sum, item) => sum + item.file.size, 0),
    files: files.map(({ field, file, content }, i) => ({
      id: `file-${i}`,
      name: file.name,
      field,
      sha256: hash(content),
      sizeBytes: file.size,
      receivedParts: []
    }))
  };
  const result = { id: 5, displayId: 'EXEC-5', result: 'PASS' };
  http.get.mockImplementation(async () => ({ data: structuredClone(session) }));
  http.post.mockImplementation(async (url) =>
    url.endsWith('/complete') ? { data: { execution: result } } : { data: structuredClone(session) }
  );
  http.put.mockImplementation(async (url, chunk, options) => {
    const match = /files\/file-(\d+)\/parts\/(\d+)$/.exec(url),
      i = Number(match[1]),
      index = Number(match[2]);
    options.onUploadProgress?.({ loaded: chunk.length });
    const file = session.files[i];
    if (!file.receivedParts.some((part) => part.index === index)) {
      file.receivedParts.push({ index, sizeBytes: chunk.length, sha256: hash(chunk) });
      session.confirmedBytes += chunk.length;
    }
    return { data: structuredClone(session) };
  });
  return {
    form,
    files,
    result,
    session,
    update: (value) => {
      session = value;
    }
  };
}
beforeEach(() => vi.resetAllMocks());
describe('resumable transport through the authenticated HTTP client', () => {
  it('hashes incrementally with bounded slices and supports abort', async () => {
    const blob = new Blob(['a'.repeat(2 * 1024 * 1024)]);
    const slice = vi.spyOn(blob, 'slice');
    expect(await fileChecksum(blob)).toBe(hash('a'.repeat(blob.size)));
    expect(slice.mock.calls.every(([start, end]) => end - start <= 262144)).toBe(true);
    const signal = AbortSignal.abort();
    await expect(fileChecksum(blob, signal)).rejects.toMatchObject({ code: 'UPLOAD_PAUSED' });
  });
  it.each([
    { large: false, multiple: false },
    { large: true, multiple: true }
  ])(
    'F01 F02 F03 F10-F12: %j sends bounded binary, preserves associations and reports 100 only after confirmation',
    async (settings) => {
      const f = fixture(settings),
        values = [],
        onSession = vi.fn();
      expect(
        await recordResumable(1, f.form, { onProgress: (value) => values.push(value), onSession })
      ).toEqual(f.result);
      const calls = http.put.mock.calls;
      expect(calls.every(([, chunk]) => chunk.length <= 8388608 && chunk.length < 100000000)).toBe(
        true
      );
      for (const [, chunk, options] of calls) {
        expect(options.headers['Content-Type']).toBe('application/octet-stream');
        expect(options.headers['X-Chunk-SHA256']).toBe(hash(chunk));
        expect(options.timeout).toBe(60000);
      }
      expect(http.post.mock.calls[0][1].files.map((file) => file.field)).toEqual(
        f.files.map((file) => file.field)
      );
      const confirming = values.find((value) => value.phase === 'FINALIZING');
      expect(confirming.confirmedBytes).toBe(f.session.totalBytes);
      expect(values.at(-1).phase).toBe('COMPLETE');
      expect(onSession).toHaveBeenLastCalledWith(null);
    }
  );
  it('F04 F05 F07: a lost part response resumes using server-confirmed parts and does not create a second session', async () => {
    const f = fixture({ large: true }),
      operation = {},
      onSession = vi.fn();
    const normal = http.put.getMockImplementation();
    let first = true;
    http.put.mockImplementation(async (...args) => {
      const response = await normal(...args);
      if (first) {
        first = false;
        throw { response: { status: 503, data: { message: 'offline' } } };
      }
      return response;
    });
    await expect(
      recordResumable(1, f.form, { operation, onSession, wait: async () => {} })
    ).resolves.toEqual(f.result);
    expect(http.post.mock.calls.filter(([url]) => !url.endsWith('complete'))).toHaveLength(1);
    expect(operation.uploadId).toBe('session');
    await recordResumable(1, f.form, { operation });
    expect(http.get).toHaveBeenCalledWith(
      '/test-cases/1/execution-uploads/session',
      expect.objectContaining({ fresh: true })
    );
    expect(http.put).toHaveBeenCalledTimes(3);
  });
  it('F09: different bytes or destination cannot resume a prior upload', async () => {
    const f = fixture(),
      operation = { uploadId: 'session' };
    f.session.files[0].sha256 = '0'.repeat(64);
    await expect(recordResumable(1, f.form, { operation })).rejects.toMatchObject({
      code: 'UPLOAD_FILE_MISMATCH'
    });
    expect(http.put).not.toHaveBeenCalled();
    expect(http.post).not.toHaveBeenCalled();
  });
  it.each(['EXPIRED', 'CANCELLED'])('F08: %s upload cannot publish', async (sessionStatus) => {
    const f = fixture();
    f.session.sessionStatus = sessionStatus;
    await expect(
      recordResumable(1, f.form, { operation: { uploadId: 'session' } })
    ).rejects.toMatchObject({ code: 'UPLOAD_GONE' });
    expect(http.put).not.toHaveBeenCalled();
  });
  it.each([401, 403, 404, 409, 413, 422, 507])(
    'F15 F17: never automatically retries permanent HTTP %i',
    async (status) => {
      const work = vi.fn().mockRejectedValue({ response: { status } }),
        wait = vi.fn();
      await expect(retryUpload(work, { wait })).rejects.toMatchObject({ response: { status } });
      expect(work).toHaveBeenCalledTimes(1);
      expect(wait).not.toHaveBeenCalled();
    }
  );
  it.each([408, 429, 500, 502, 503, 504])(
    'bounded transient retries for HTTP %i honor Retry-After',
    async (status) => {
      const work = vi
          .fn()
          .mockRejectedValue({ response: { status, headers: { 'retry-after': '2' } } }),
        wait = vi.fn();
      await expect(retryUpload(work, { wait })).rejects.toMatchObject({ response: { status } });
      expect(work).toHaveBeenCalledTimes(3);
      expect(wait.mock.calls.map(([ms]) => ms)).toEqual([2000, 2000]);
    }
  );
  it('does not shorten long Retry-After, retries network errors, and aborts before the next attempt', async () => {
    const work = vi
      .fn()
      .mockRejectedValue({ response: { status: 429, headers: { 'retry-after': '90' } } });
    await expect(retryUpload(work, { wait: vi.fn() })).rejects.toBeDefined();
    expect(work).toHaveBeenCalledTimes(1);
    const signal = new AbortController(),
      network = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(
      retryUpload(network, { signal: signal.signal, wait: async () => signal.abort() })
    ).rejects.toMatchObject({ code: 'UPLOAD_PAUSED' });
    expect(network).toHaveBeenCalledTimes(1);
  });
  it('F06 F13: abort discards late confirmation and status/cancel use the shared transport', async () => {
    const f = fixture(),
      controller = new AbortController(),
      progress = [];
    http.put.mockImplementation(async () => {
      controller.abort();
      throw Error('aborted');
    });
    await expect(
      recordResumable(1, f.form, {
        signal: controller.signal,
        onProgress: (value) => progress.push(value)
      })
    ).rejects.toBeDefined();
    expect(progress.at(-1).phase).toBe('PAUSED');
    expect(http.post.mock.calls.some(([url]) => url.endsWith('complete'))).toBe(false);
    http.get.mockResolvedValue({ data: { uploads: [f.session] } });
    expect(await resumableUploadsApi.list(1)).toEqual([f.session]);
    http.delete.mockResolvedValue({ data: { sessionStatus: 'CANCELLED' } });
    expect(await resumableUploadsApi.cancel(1, 'session')).toEqual({ sessionStatus: 'CANCELLED' });
  });
  it('rejects an oversized JSON payload before init', async () => {
    const f = fixture();
    f.form.set('payload', 'x'.repeat(6291457));
    await expect(recordResumable(1, f.form)).rejects.toMatchObject({
      code: 'UPLOAD_PAYLOAD_TOO_LARGE'
    });
    expect(http.post).not.toHaveBeenCalled();
  });
});
