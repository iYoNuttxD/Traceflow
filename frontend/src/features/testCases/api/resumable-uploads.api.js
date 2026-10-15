import { sha256 } from '@noble/hashes/sha2.js';
import { httpClient } from '../../../api/http-client.js';
const CHUNK_BYTES = 8 * 1024 * 1024;
const base = (id) => `/test-cases/${id}/execution-uploads`;
const hex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
const failure = (message, code) =>
  Object.assign(new Error(message), { code, resumableUpload: true });
const abort = (signal) => {
  if (signal?.aborted) throw failure('Envio interrompido. Você pode retomá-lo.', 'UPLOAD_PAUSED');
};
async function bytes(blob) {
  if (blob.arrayBuffer) return new Uint8Array(await blob.arrayBuffer());
  return new Uint8Array(
    await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    })
  );
}
export async function fileChecksum(file, signal) {
  const hash = sha256.create();
  for (let offset = 0; offset < file.size; offset += 256 * 1024) {
    abort(signal);
    hash.update(await bytes(file.slice(offset, offset + 256 * 1024)));
  }
  abort(signal);
  return hex(hash.digest());
}
function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const cancelled = () => {
      clearTimeout(timer);
      reject(failure('Envio interrompido.', 'UPLOAD_PAUSED'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', cancelled);
      resolve();
    }, ms);
    signal?.addEventListener('abort', cancelled, { once: true });
    if (signal?.aborted) cancelled();
  });
}
export async function retryUpload(work, { signal, onRetry = () => {}, wait = delay } = {}) {
  for (let attempt = 0; ; attempt++) {
    abort(signal);
    try {
      return await work();
    } catch (error) {
      abort(signal);
      const status = error.response?.status;
      const retryable = !status || [408, 429, 500, 502, 503, 504].includes(status);
      const header = error.response?.headers?.['retry-after'];
      const seconds = header
        ? /^\d+$/.test(String(header))
          ? Number(header)
          : Math.max(0, (Date.parse(header) - Date.now()) / 1000)
        : 0;
      const ms = Math.max(500 * 2 ** attempt, Number.isFinite(seconds) ? seconds * 1000 : 0);
      if (!retryable || attempt >= 2 || ms > 30000) throw error;
      onRetry({ attempt: attempt + 1, delayMs: ms });
      await wait(ms, signal);
    }
  }
}
export const resumableUploadsApi = {
  async list(id, signal) {
    return (await httpClient.get(base(id), { signal, fresh: true })).data.uploads;
  },
  async status(id, uploadId, signal) {
    return (await httpClient.get(`${base(id)}/${uploadId}`, { signal, fresh: true })).data;
  },
  async cancel(id, uploadId, signal) {
    return (await httpClient.delete(`${base(id)}/${uploadId}`, { signal })).data;
  }
};
export async function recordResumable(
  id,
  formData,
  { signal, operation = {}, onSession = () => {}, onProgress = () => {}, wait } = {}
) {
  let latest = { phase: 'HASHING', confirmedBytes: 0, sentBytes: 0, totalBytes: 0, files: [] };
  const notify = (patch) => {
    latest = { ...latest, ...patch };
    onProgress(latest);
  };
  const retry = (work) =>
    retryUpload(work, {
      signal,
      wait,
      onRetry: ({ attempt, delayMs }) => notify({ retry: attempt, retryDelayMs: delayMs })
    });
  try {
    const payloadText = formData.get('payload');
    if (new TextEncoder().encode(payloadText).byteLength > 6 * 1024 * 1024)
      throw failure('Os dados da execução excedem 6 MiB.', 'UPLOAD_PAYLOAD_TOO_LARGE');
    const payload = JSON.parse(payloadText);
    const selected = Array.from(formData.entries())
      .filter(([field]) => field !== 'payload')
      .map(([field, file]) => ({ field, file }));
    notify({ totalBytes: selected.reduce((sum, { file }) => sum + file.size, 0) });
    const files = [];
    for (const { field, file } of selected) {
      files.push({
        field,
        name: file.name,
        sizeBytes: file.size,
        sha256: await fileChecksum(file, signal)
      });
      notify({ hashedFiles: files.length, fileCount: selected.length });
    }
    operation.idempotencyKey ||= crypto.randomUUID();
    onSession(operation);
    let session = operation.uploadId
      ? await retry(() => resumableUploadsApi.status(id, operation.uploadId, signal))
      : (
          await retry(() =>
            httpClient.post(
              base(id),
              {
                idempotencyKey: operation.idempotencyKey,
                testCaseVersion: payload.testCaseVersion,
                files
              },
              { signal }
            )
          )
        ).data;
    operation.uploadId = session.uploadId;
    onSession(operation);
    if (
      session.testCaseVersion !== payload.testCaseVersion ||
      session.files.length !== files.length ||
      session.files.some(
        (file, index) =>
          file.field !== files[index].field ||
          file.sizeBytes !== files[index].sizeBytes ||
          file.sha256 !== files[index].sha256
      )
    )
      throw failure(
        'Selecione os mesmos arquivos e destinos do envio original. Para alterar arquivos, cancele esse envio.',
        'UPLOAD_FILE_MISMATCH'
      );
    if (
      ['EXPIRED', 'CANCELLED'].includes(session.sessionStatus) ||
      (session.sessionStatus !== 'COMPLETED' && new Date(session.expiresAt) <= new Date())
    )
      throw failure('O envio expirou ou foi cancelado. Inicie um novo envio.', 'UPLOAD_GONE');
    notify({ phase: 'UPLOADING', ...session, sentBytes: session.confirmedBytes });
    if (session.sessionStatus !== 'COMPLETED') {
      for (let fileIndex = 0; fileIndex < selected.length; fileIndex++) {
        const file = selected[fileIndex].file,
          remote = session.files[fileIndex];
        for (let index = 0; index < Math.ceil(file.size / CHUNK_BYTES); index++) {
          abort(signal);
          if (remote.receivedParts.some((part) => part.index === index)) continue;
          const offset = index * CHUNK_BYTES,
            chunk = await bytes(file.slice(offset, offset + CHUNK_BYTES));
          const checksum = hex(sha256(chunk));
          const confirmed = session.confirmedBytes;
          session = (
            await retry(() =>
              httpClient.put(
                `${base(id)}/${session.uploadId}/files/${remote.id}/parts/${index}`,
                chunk,
                {
                  signal,
                  timeout: 60000,
                  headers: {
                    'Content-Type': 'application/octet-stream',
                    'X-Chunk-SHA256': checksum,
                    'X-Chunk-Offset': String(offset)
                  },
                  onUploadProgress: (event) =>
                    notify({
                      sentBytes: Math.min(session.totalBytes, confirmed + (event.loaded || 0))
                    })
                }
              )
            )
          ).data;
          notify({ ...session, phase: 'UPLOADING', sentBytes: session.confirmedBytes, retry: 0 });
        }
      }
    }
    notify({ phase: 'FINALIZING' });
    const result = (
      await retry(() =>
        httpClient.post(`${base(id)}/${session.uploadId}/complete`, payload, {
          signal,
          timeout: 90000
        })
      )
    ).data.execution;
    notify({
      phase: 'COMPLETE',
      confirmedBytes: session.totalBytes,
      sentBytes: session.totalBytes
    });
    onSession(null);
    return result;
  } catch (error) {
    error.resumableUpload = true;
    notify({
      phase: signal?.aborted || error.code === 'UPLOAD_PAUSED' ? 'PAUSED' : 'ERROR',
      message: signal?.aborted
        ? 'Envio interrompido. Os arquivos confirmados permanecem disponíveis para retomada.'
        : error.response?.data?.message || error.message || 'Não foi possível concluir o envio.',
      errorCode: error.response?.data?.code || error.code
    });
    throw error;
  }
}
