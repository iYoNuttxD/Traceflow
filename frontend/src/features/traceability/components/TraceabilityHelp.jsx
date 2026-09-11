import { useId, useRef, useState } from 'react';
import { TraceFlowIcon } from '../../../shared/index.js';
import { traceabilityHelp } from '../model/phase.js';
import './TraceabilityHelp.css';
export function TraceabilityHelp({ topic, context }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({});
  const trigger = useRef(null);
  function show() {
    const rect = trigger.current.getBoundingClientRect();
    const width = Math.min(304, window.innerWidth * 0.75);
    setPosition({
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      ...(rect.bottom > window.innerHeight * 0.6
        ? { bottom: window.innerHeight - rect.top + 8 }
        : { top: rect.bottom + 8 })
    });
    setOpen(true);
  }
  const [title, text] = traceabilityHelp[topic];
  return (
    <span className="trace-help" onMouseEnter={show} onMouseLeave={() => setOpen(false)}>
      <button
        ref={trigger}
        type="button"
        className="trace-help-trigger nodrag"
        aria-label={`Ajuda: ${title}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onFocus={show}
        onBlur={() => setOpen(false)}
        onClick={show}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
        }}
      >
        <TraceFlowIcon name="info" />
      </button>
      {open && (
        <span className="trace-help-popover" style={position} role="tooltip" id={id}>
          <strong>{title}</strong>
          <span>{text}</span>
          {context && <span>{context}</span>}
        </span>
      )}
    </span>
  );
}
export function TraceabilityGuide() {
  return (
    <details className="trace-guide">
      <summary>
        <TraceFlowIcon name="branch" />
        <strong>Como interpretar este fluxo?</strong>
      </summary>
      <div>
        <p>
          Leia a cadeia principalmente da esquerda para a direita. Selecione um artefato para
          destacar suas conexões e entender seu papel no Inspector.
        </p>
        <dl className="trace-guide-chains">
          <div>
            <dt>Implementação</dt>
            <dd>Tarefa → PR / Commit / Issue</dd>
            <p>PRs e commits comprovam implementação; issues dão contexto.</p>
          </div>
          <div>
            <dt>Validação</dt>
            <dd>Caso de teste → Execução</dd>
            <p>A execução registra o resultado e a versão que foi testada.</p>
          </div>
          <div>
            <dt>Qualidade</dt>
            <dd>Execução com falha → Defeito</dd>
            <p>O defeito identifica a falha e o passo que a detectou.</p>
          </div>
          <div>
            <dt>Correção</dt>
            <dd>Defeito → Tarefa de correção → Reteste</dd>
            <p>O reteste verifica a correção no ciclo correspondente.</p>
          </div>
        </dl>
        <p className="trace-guide-legend">
          <span className="trace-guide-line" aria-hidden="true" /> Cadeia principal{' '}
          <span className="trace-guide-line is-secondary" aria-hidden="true" /> Relação de contexto
        </p>
        <p>
          Arraste os cards para organizar e o fundo para explorar. Aproxime uma conexão com o
          ponteiro ou teclado para ler seu rótulo. Todas as relações também aparecem no Inspector.
        </p>
      </div>
    </details>
  );
}
