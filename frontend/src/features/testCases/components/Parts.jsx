import { useEffect, useId, useRef, useState } from 'react';
import { TraceFlowIcon } from '../../../shared/index.js';
import {
  evidenceAccept,
  evidenceError,
  environments,
  referenceLabel
} from '../model/test-cases.js';
const states = {
  WAITING: ['info', 'refresh', 'Aguardando reteste'],
  PASS: ['success', 'check', 'Aprovado'],
  FAIL: ['danger', 'close', 'Falhou'],
  BLOCKED: ['warning', 'lock', 'Bloqueado'],
  PENDING: ['neutral', 'info', 'Pendente'],
  NEVER: ['neutral', 'info', 'Nunca executado'],
  ATIVO: ['success', 'check', 'Ativo'],
  INATIVO: ['neutral', 'lock', 'Inativo']
};
export function Badge({ value, raw = false }) {
  const [tone, icon, label] = states[value];
  return (
    <span className={`tc-badge tc-badge--${tone}`}>
      <TraceFlowIcon name={icon} />
      {raw ? value : label}
    </span>
  );
}
export function Field({ id, label, error, children }) {
  return (
    <div className="tc-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error && (
        <p className="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export { SelectControl } from '../../../shared/index.js';
export function EvidenceList({ evidences, onRemove }) {
  return (
    <ul className="tc-evidences">
      {evidences.map((file) => (
        <li key={file.id}>
          <div className="tc-file">
            <strong title={file.name}>{file.name}</strong>
            <small>
              {file.name.split('.').pop().toUpperCase()} ·{' '}
              {file.size < 1024 ** 2
                ? `${Math.max(1, Math.round(file.size / 1024))} KB`
                : `${(file.size / 1024 ** 2).toFixed(2)} MB`}{' '}
            </small>
          </div>
          {onRemove && (
            <button
              type="button"
              className="button button-secondary tc-icon-button"
              aria-label={`Remover ${file.name}`}
              onClick={() => onRemove(file.id)}
            >
              <TraceFlowIcon name="close" />
            </button>
          )}
          <Preview file={file.file} name={file.name} />
        </li>
      ))}
    </ul>
  );
}
function Preview({ file, name }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) return;
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url ? <img className="tc-preview" src={url} alt={`Evidência local: ${name}`} /> : null;
}
export function EvidencePicker({
  evidences,
  onChange,
  perStep = false,
  executionEvidences = evidences
}) {
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const id = useId();
  const action = perStep ? 'Adicionar foto ou vídeo' : 'Adicionar evidência';
  return (
    <section
      className={`tc-evidence-picker ${perStep ? 'tc-step-evidence' : 'tc-surface'}`}
      aria-labelledby={`${id}-title`}
    >
      <h3 id={`${id}-title`}>{perStep ? 'Evidências do passo' : 'Evidências da execução'}</h3>
      <p className="field-help">
        {perStep ? 'Fotos e vídeos opcionais deste passo.' : 'Evidências gerais são opcionais.'}
      </p>
      <input
        id={id}
        ref={inputRef}
        hidden
        type="file"
        multiple
        aria-label={action}
        accept={evidenceAccept(perStep)}
        aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`}
        aria-invalid={Boolean(error)}
        onChange={(event) => {
          const files = [...event.target.files];
          const message = evidenceError(executionEvidences, files, perStep, evidences.length);
          setError(message);
          if (!message)
            onChange([
              ...evidences,
              ...files.map((file) => ({
                id: crypto.randomUUID(),
                name: file.name,
                size: file.size,
                type: file.type,
                file
              }))
            ]);
          event.target.value = '';
        }}
      />
      <button
        type="button"
        className="tc-add-control"
        onClick={() => inputRef.current?.click()}
        aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`}
      >
        <span className="tc-add-control__icon">
          <TraceFlowIcon name="plus" />
        </span>
        {action}
      </button>
      <p className="field-help" id={`${id}-help`}>
        {perStep
          ? 'PNG, JPG/JPEG, WEBP, MP4, WEBM e MOV.'
          : 'PNG, JPG/JPEG, WEBP, MP4, WEBM, MOV, PDF, TXT, LOG e JSON.'}{' '}
        Até 50 MiB por vídeo e 10 MiB por outro arquivo; {perStep ? 3 : 5} arquivos neste destino,
        20 arquivos e 100 MiB por execução. O servidor valida o conteúdo e pode aplicar limites
        menores.
      </p>
      {error && (
        <p className="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
      {!evidences.length && <p className="tc-evidence-empty">Nenhuma evidência adicionada.</p>}
      <EvidenceList
        evidences={evidences}
        onRemove={(id) => {
          onChange(evidences.filter((file) => file.id !== id));
          setError('');
        }}
      />
    </section>
  );
}
export function Latest({ execution }) {
  return (
    <div className="tc-latest">
      <small>Última execução</small>
      <Badge value={execution?.result || 'NEVER'} />
      {execution && (
        <>
          <span className="tc-card-metadata">
            <TraceFlowIcon name="calendar" />
            <span>{new Date(execution.executedAt).toLocaleDateString('pt-BR')}</span>
          </span>
          <span className="tc-card-metadata">
            <TraceFlowIcon name="code" />
            <span>{environments[execution.environment]}</span>
          </span>
          <span className="tc-card-metadata" title={referenceLabel(execution.testedReference)}>
            <TraceFlowIcon name="branch" />
            <span>{referenceLabel(execution.testedReference)}</span>
          </span>
        </>
      )}
    </div>
  );
}
