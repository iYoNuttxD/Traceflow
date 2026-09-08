import { useEffect, useState } from 'react';
import { testCasesApi } from '../api/test-cases.api.js';
import { useTestCaseScope } from './useTestCaseScope.js';
import { evidenceKind, previewUnavailable } from '../model/evidence-viewer.js';

export function useEvidenceContent(file, projectId) {
  const identity = file ? `${projectId}:${file.id}` : '';
  const scope = useTestCaseScope(identity);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!file) {
      setResult(null);
      return undefined;
    }
    const token = scope.begin('preview');
    let url;
    const publish = (value) => {
      if (scope.accepts('preview', token)) setResult({ identity, scope, file, attempt, ...value });
    };
    async function load() {
      const unavailable = previewUnavailable(file);
      if (unavailable) {
        publish({ unavailable });
        return;
      }
      try {
        const { data: blob } = await testCasesApi.content(file.id, {
          signal: token.controller.signal
        });
        if (!scope.accepts('preview', token)) return;
        const kind = evidenceKind(file.mimeType);
        // Validate transport type too. A redirected/error HTML body must never be embedded.
        if (evidenceKind(blob.type) !== kind) {
          publish({
            blob,
            unavailable:
              'O formato recebido não corresponde à evidência. Visualização não disponível.'
          });
          return;
        }
        const tooLarge = previewUnavailable({ ...file, sizeBytes: blob.size });
        if (tooLarge) {
          publish({ blob, unavailable: tooLarge });
          return;
        }
        if (['text', 'json'].includes(kind)) {
          const text = await blob.text();
          if (!scope.accepts('preview', token)) return;
          if (kind === 'json') {
            try {
              publish({ blob, text: JSON.stringify(JSON.parse(text), null, 2) });
            } catch {
              publish({ blob, unavailable: 'Não foi possível interpretar o JSON.' });
            }
          } else publish({ blob, text });
        } else {
          url = URL.createObjectURL(blob);
          publish({ blob, url });
        }
      } catch {
        publish({ error: 'Não foi possível carregar esta evidência.' });
      }
    }
    void load();
    return () => {
      scope.cancelRead('preview');
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, identity, scope, attempt]);
  const current =
    result?.identity === identity &&
    result.scope === scope &&
    result.file === file &&
    result.attempt === attempt
      ? result
      : null;
  return {
    ...(current || { loading: Boolean(file) }),
    retry: () => setAttempt((value) => value + 1)
  };
}
