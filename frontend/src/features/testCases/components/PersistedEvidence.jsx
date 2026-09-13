import { useEffect, useRef, useState } from 'react';
import { normalizeApiError } from '../../../shared/index.js';
import { testCasesApi } from '../api/test-cases.api.js';
import { useTestCaseScope } from '../hooks/useTestCaseScope.js';

import { evidenceDescription } from '../model/evidence-viewer.js';

export function PersistedEvidence({ evidence, onPreview, source }) {
  return (
    <ul className="tc-evidences">
      {evidence.map((file) => (
        <li key={file.id}>
          <div className="tc-file">
            <strong>{file.originalName}</strong>
            <small>{evidenceDescription(file)}</small>
          </div>
          <div className="tc-evidence-actions">
            {onPreview && (
              <button
                className="button button-compact"
                aria-label={`Visualizar ${file.originalName}`}
                onClick={(event) => onPreview(file, source, event.currentTarget)}
              >
                Visualizar
              </button>
            )}
            <EvidenceDownloadButton file={file} />
          </div>
        </li>
      ))}
    </ul>
  );
}
export function EvidenceDownloadButton({ file, blob, disabled = false, label = 'Baixar' }) {
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
      const data =
        blob || (await testCasesApi.content(file.id, { signal: token.controller.signal })).data;
      if (!scope.accepts('download', token)) return;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(data);
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
    <span className="tc-download-action">
      <button
        className="button button-secondary button-compact"
        disabled={busy || disabled}
        onClick={download}
        aria-label={`Baixar ${file.originalName}`}
      >
        {busy ? 'Baixando…' : label}
      </button>
      {error && (
        <span role="alert" className="field-error">
          {error}
        </span>
      )}
    </span>
  );
}
