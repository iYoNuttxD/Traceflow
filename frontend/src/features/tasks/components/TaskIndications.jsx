import { TraceFlowIcon } from '../../../shared/index.js';
import { traceabilityLine } from './kanban-view.js';
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

export function AlertIndexNotice({ error, onRetry }) {
  if (!error) return null;
  return (
    <p className="task-alert-index-notice" role="status">
      As tarefas concluídas sem commit não puderam ser carregadas agora; o marcador e o filtro de
      concluídas sem commit podem estar incompletos.{' '}
      <button type="button" className="button button-secondary button-compact" onClick={onRetry}>
        Tentar novamente
      </button>
    </p>
  );
}
