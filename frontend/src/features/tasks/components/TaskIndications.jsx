import { TraceFlowIcon } from '../../../shared/index.js';
import { technicalLinkSummary, traceabilityLine } from './kanban-view.js';
import './TaskIndications.css';

export function TaskTraceabilityLine({ task }) {
  const line = traceabilityLine(task);
  if (line.unavailable) return 'Rastreabilidade indisponível';
  return (
    <>
      {line.technical || <span className="task-trace-line__missing">Sem vínculo técnico</span>}
      {' · '}
      {line.requirement || <span className="task-trace-line__discreet">Sem requisito</span>}
    </>
  );
}

export function TaskInconsistencyMarker({ task, onOpen }) {
  return (
    <div className="task-inconsistency-marker">
      <button
        type="button"
        aria-label={`Concluída sem commit: abrir a inconsistência da TASK-${task.id}`}
        onClick={(event) => onOpen(task, event.currentTarget)}
      >
        <TraceFlowIcon name="alert" />
        <span>Concluída sem commit</span>
      </button>
    </div>
  );
}

export function TechnicalLinkSummary({ tasks, active = false, onToggle }) {
  const summary = technicalLinkSummary(tasks);
  if (!summary.total) return null;
  return (
    <div className="task-link-summary">
      {summary.unlinked > 0 ? (
        <button
          type="button"
          className="button button-secondary button-compact"
          aria-pressed={active}
          onClick={onToggle}
        >
          {summary.text}
        </button>
      ) : (
        <span className="task-link-summary__text">{summary.text}</span>
      )}
      <span className="task-link-summary__hint">
        {summary.unlinked > 0
          ? 'Mostra só as tarefas sem commit, PR ou issue vinculados (RF58).'
          : 'Toda tarefa tem commit, PR ou issue vinculados.'}
      </span>
    </div>
  );
}

export function AlertIndexNotice({ error, onRetry }) {
  if (!error) return null;
  return (
    <p className="task-alert-index-notice" role="status">
      As tarefas concluídas sem commit não puderam ser carregadas agora; o marcador e o filtro do
      RF13 podem estar incompletos.{' '}
      <button type="button" className="button button-secondary button-compact" onClick={onRetry}>
        Tentar novamente
      </button>
    </p>
  );
}
