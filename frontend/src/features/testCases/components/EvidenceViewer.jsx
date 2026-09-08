import { useState } from 'react';
import { LoadingState } from '../../../shared/index.js';
import { evidenceKind } from '../model/evidence-viewer.js';
import { EvidenceDownloadButton } from './PersistedEvidence.jsx';

export function EvidenceViewer({ file, source, content, onBack }) {
  const [mediaError, setMediaError] = useState(false);
  const kind = evidenceKind(file.mimeType);
  const fallback = (message) => (
    <div className="tc-preview-fallback" role="status">
      <p>{message}</p>
      <EvidenceDownloadButton
        file={file}
        blob={content.blob}
        label={kind === 'pdf' ? 'Baixar PDF' : 'Baixar arquivo'}
      />
    </div>
  );
  return (
    <section className="tc-evidence-viewer" aria-label={`Visualização de ${file.originalName}`}>
      {source && <p className="field-help">{source}</p>}
      {content.loading ? (
        <LoadingState message="Carregando evidência…" />
      ) : content.error ? (
        <div className="tc-preview-fallback" role="alert">
          <p>{content.error}</p>
          <div className="tc-evidence-actions">
            <button className="button button-secondary" onClick={content.retry}>
              Tentar novamente
            </button>
            <button className="button button-secondary" onClick={onBack}>
              Voltar
            </button>
          </div>
        </div>
      ) : content.unavailable ? (
        fallback(content.unavailable)
      ) : mediaError ? (
        fallback(
          kind === 'video'
            ? 'Este navegador não consegue reproduzir este vídeo.'
            : kind === 'pdf'
              ? 'Não foi possível visualizar este PDF neste navegador.'
              : 'Não foi possível visualizar esta imagem.'
        )
      ) : (
        <div className="tc-preview-surface">
          {kind === 'image' && (
            <img
              src={content.url}
              alt={`Evidência ${file.originalName}`}
              onError={() => setMediaError(true)}
            />
          )}
          {kind === 'video' && (
            <video
              src={content.url}
              controls
              autoPlay={false}
              preload="metadata"
              tabIndex={0}
              aria-label={`Evidência ${file.originalName}`}
              onError={() => setMediaError(true)}
            />
          )}
          {kind === 'pdf' && (
            <object
              data={content.url}
              type="application/pdf"
              tabIndex={0}
              aria-label={`PDF ${file.originalName}`}
            >
              {fallback('Não foi possível visualizar este PDF neste navegador.')}
            </object>
          )}
          {['text', 'json'].includes(kind) && (
            <pre tabIndex={0} aria-label={`Conteúdo de ${file.originalName}`}>
              {content.text}
            </pre>
          )}
        </div>
      )}
    </section>
  );
}
