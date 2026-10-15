import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ExecutionUploadProgress } from '../../src/features/testCases/components/ExecutionUploadProgress.jsx';
import { useExecutionUpload } from '../../src/features/testCases/hooks/useExecutionUpload.js';
const api = vi.hoisted(() => ({ list: vi.fn(), cancel: vi.fn() }));
vi.mock('../../src/features/testCases/api/resumable-uploads.api.js', () => ({
  resumableUploadsApi: api
}));
beforeEach(() => {
  sessionStorage.clear();
  vi.resetAllMocks();
});
it('F03 F18 F19: exposes accessible progress below 100, per-file progress and controls outside disabled form', () => {
  const upload = {
    state: {
      phase: 'FINALIZING',
      totalBytes: 10,
      confirmedBytes: 10,
      files: [
        { id: '1', name: 'a'.repeat(200) + '.json', sizeBytes: 10, receivedParts: [{ index: 0 }] }
      ]
    },
    pending: [],
    pause: vi.fn(),
    discover: vi.fn(),
    cancel: vi.fn()
  };
  const { rerender } = render(<ExecutionUploadProgress upload={upload} busy />);
  expect(screen.getByRole('progressbar')).toHaveAttribute('value', '99');
  expect(screen.getByRole('status')).toHaveTextContent('Confirmando execução');
  fireEvent.click(screen.getByRole('button', { name: 'Interromper envio' }));
  expect(upload.pause).toHaveBeenCalled();
  rerender(
    <ExecutionUploadProgress
      upload={{ ...upload, state: { ...upload.state, phase: 'COMPLETE' } }}
    />
  );
  expect(screen.getByRole('progressbar')).toHaveAttribute('value', '100');
  expect(screen.getByRole('region', { name: 'Envio de evidências' })).toHaveClass(
    'tc-upload-progress'
  );
});
it('F05 F13: persists only opaque IDs, aborts and ignores updates after leaving the context', () => {
  const { result, unmount } = renderHook(() => useExecutionUpload(7));
  let options;
  act(() => {
    options = result.current.options();
    options.onSession({ idempotencyKey: 'a'.repeat(36), uploadId: 'id', file: 'PRIVATE_BYTES' });
  });
  expect(sessionStorage.getItem('traceflow.execution-upload.7')).not.toContain('PRIVATE_BYTES');
  unmount();
  expect(options.signal.aborted).toBe(true);
  options.onSession({ idempotencyKey: 'b'.repeat(36), uploadId: 'late' });
  expect(sessionStorage.getItem('traceflow.execution-upload.7')).not.toContain('late');
  const resumed = renderHook(() => useExecutionUpload(7));
  act(() => {
    options = resumed.result.current.options();
  });
  expect(options.operation.uploadId).toBe('id');
});
it('F06 F08: discovers, selects and cancels owned pending uploads without persisting files', async () => {
  const row = {
    uploadId: 'owned',
    sessionStatus: 'OPEN',
    expiresAt: '2099-01-01',
    files: [{ name: 'private.json' }]
  };
  api.list.mockResolvedValue([row, { ...row, sessionStatus: 'EXPIRED' }]);
  api.cancel.mockResolvedValue({});
  const { result } = renderHook(() => useExecutionUpload(2));
  await act(() => result.current.discover());
  expect(result.current.pending).toHaveLength(1);
  act(() => result.current.select(row));
  expect(result.current.state.phase).toBe('PAUSED');
  expect(sessionStorage.getItem('traceflow.execution-upload.2')).not.toContain('private.json');
  await act(() => result.current.cancel());
  expect(api.cancel).toHaveBeenCalledWith(2, 'owned');
  expect(sessionStorage.getItem('traceflow.execution-upload.2')).toBeNull();
});
it('does not erase an uncertain cancellation receipt or apply late discovery results', async () => {
  const pending = Promise.withResolvers();
  api.list.mockReturnValue(pending.promise);
  api.cancel.mockRejectedValue({ response: { status: 503, data: { message: 'indisponível' } } });
  const { result, unmount } = renderHook(() => useExecutionUpload(3));
  act(() => result.current.select({ uploadId: 'owned' }));
  await act(() => result.current.cancel());
  expect(result.current.message).toBe('indisponível');
  expect(sessionStorage.getItem('traceflow.execution-upload.3')).toContain('owned');
  let reading;
  act(() => {
    reading = result.current.discover();
  });
  unmount();
  await act(async () => {
    pending.resolve([]);
    await reading;
  });
});
