import { useEffect, useRef, useState } from 'react';
import { normalizeApiError } from '../../../shared/index.js';
import { testCasesApi } from '../api/test-cases.api.js';
import { useTestCaseScope } from '../hooks/useTestCaseScope.js';

export function PersistedEvidence({ evidence }) {
  return (
    <ul className="tc-evidences">
      {evidence.map((file) => (
        <EvidenceDownload key={file.id} file={file} />
      ))}
    </ul>
  );
}
function EvidenceDownload({ file }) {
  const scope = useTestCaseScope(file.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const urlRef = useRef(null);
  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    []
  );
  async function download() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    const token = scope.begin('download');
    try {
      const response = await testCasesApi.content(file.id, { signal: token.controller.signal });
      if (!scope.accepts('download', token)) return;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(response.data);
      urlRef.current = url;
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.originalName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      // The click has synchronously handed the resource to the browser download manager.
      setTimeout(() => {
        URL.revokeObjectURL(url);
        if (urlRef.current === url) urlRef.current = null;
      }, 0);
    } catch (e) {
      if (scope.accepts('download', token))
        setError(normalizeApiError(e, 'Não foi possível baixar a evidência.').message);
    } finally {
      lock.current = false;
      if (scope.accepts('download', token)) setBusy(false);
    }
  }
  return (
    <li>
      <div className="tc-file">
        <strong>{file.originalName}</strong>
        <small>
          {file.mimeType} · {file.sizeBytes.toLocaleString('pt-BR')} bytes
        </small>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
      </div>
      <button
        className="button button-secondary"
        disabled={busy}
        onClick={download}
        aria-label={`Baixar ${file.originalName}`}
      >
        {busy ? 'Baixando…' : 'Baixar'}
      </button>
    </li>
  );
}
