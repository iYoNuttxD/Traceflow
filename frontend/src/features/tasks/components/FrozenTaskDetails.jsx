import { TaskTraceability } from './TaskTraceability.jsx';
import { KanbanDialog } from './KanbanDialog.jsx';
import {
  ArtifactCategory,
  TaskDetailsLayout,
  TaskInformation,
  TaskTraceabilityGrid
} from './TaskDetailsLayout.jsx';
import { frozenTaskDetailsView } from './frozen-task-details-view.js';

export function FrozenTaskDetails({
  task,
  sprintName,
  historicalLimitations = [],
  returnFocusRef,
  onClose,
  onOpenCurrent,
  opening,
  unavailable,
  error
}) {
  const details = frozenTaskDetailsView(task);
  return (
    <KanbanDialog
      title={details.title}
      description={
        <>
          <span>Estado no encerramento da {sprintName || `Sprint #${task.sprintId}`}</span>
          <br />
          <span>{details.cutoff}</span>
        </>
      }
      size="wide"
      returnFocusRef={returnFocusRef}
      onClose={onClose}
    >
      <TaskDetailsLayout>
        {(!task.snapshotAvailable ||
          (task.snapshotVersion !== 2 && historicalLimitations.length > 0)) && (
          <p className="message message-warning" role="status">
            Snapshot detalhado indisponível para esta Sprint histórica. Os campos não capturados
            estão identificados abaixo.
          </p>
        )}
        <TaskInformation details={details} />
        {details.artifacts ? (
          <TaskTraceability task={details.artifacts} />
        ) : (
          <TaskTraceabilityGrid>
            {details.traceability.map((category) => (
              <ArtifactCategory key={category.key} label={category.label} count={category.count}>
                <p>{category.text}</p>
              </ArtifactCategory>
            ))}
          </TaskTraceabilityGrid>
        )}
        {error && (
          <p className="message message-error" role="alert">
            {error}
          </p>
        )}
        {!task.currentTaskId && <p className="field-help">Tarefa atual indisponível.</p>}
        {task.currentTaskId && (
          <div className="form-actions">
            <button
              type="button"
              className="button button-secondary"
              disabled={opening || unavailable}
              onClick={() => onOpenCurrent(task)}
            >
              {opening ? 'Abrindo...' : 'Abrir tarefa atual'}
            </button>
          </div>
        )}
      </TaskDetailsLayout>
    </KanbanDialog>
  );
}
