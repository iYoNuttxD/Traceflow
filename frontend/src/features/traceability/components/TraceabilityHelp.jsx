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
      <summary>Como interpretar este fluxo?</summary>
      <div>
        <p>
          <strong>Requisito</strong> define o que entregar. <strong>Tarefas</strong> representam o
          trabalho de implementação ou correção; PRs e commits comprovam sua implementação. Issues
          dão contexto técnico.
        </p>
        <p>
          <strong>Caso de teste</strong> define a verificação. <strong>Execução</strong> registra
          PASS, FAIL ou BLOCKED. Um <strong>defeito</strong> aponta a falha e o passo que a
          detectou.
        </p>
        <p>
          <strong>Correção</strong> identifica a tarefa vinculada ao defeito.{' '}
          <strong>Reteste</strong> é a execução usada para verificar essa correção.
        </p>
        <p>
          Arraste os cards para organizar. Selecione um artefato para destacar suas conexões e ler o
          Inspector. Linhas discretas indicam contexto; todas as relações podem ser consultadas no
          Inspector. O zoom preserva a leitura: arraste o fundo para explorar o restante.
        </p>
      </div>
    </details>
  );
}
