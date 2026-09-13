import { createPortal } from 'react-dom';
import { SprintDialog } from '../../schedule/index.js';
import { LoadingState, ErrorState } from '../../../shared/index.js';
import { TraceabilityFlow } from './TraceabilityFlow.jsx';
import { SituationBadge } from './RequirementCatalog.jsx';
import { phaseLabel } from '../model/phase.js';
import { TraceabilityPhaseTrail } from './TraceabilityPhaseTrail.jsx';
import { percentageLabel } from '../model/requirement-view.js';
import { TraceabilityHelp, TraceabilityGuide } from './TraceabilityHelp.jsx';
import './TraceabilityWorkspace.css';
export function WorkspaceSummary({ projection }) {
  return (
    <div className="trace-workspace-context">
      <dl className="trace-workspace-summary">
        <div>
          <dt>
            Fase atual
            <TraceabilityHelp topic="phase" />
          </dt>
          <dd>{phaseLabel(projection?.situation)}</dd>
        </div>
        <div>
          <dt>
            Situação
            <TraceabilityHelp topic="situation" />
          </dt>
          <dd>
            <SituationBadge value={projection?.situation} />
          </dd>
        </div>
        <div>
          <dt>
            Progresso de implementação
            <TraceabilityHelp
              topic="progress"
              context={
                projection
                  ? `${projection.progress.tasksDone} de ${projection.progress.tasksTotal} tarefas concluídas.`
                  : undefined
              }
            />
          </dt>
          <dd>{projection ? percentageLabel(projection.progress) : '—'}</dd>
          {projection && (
            <>
              <div className="traceability-progress-bar" aria-hidden="true">
                <span style={{ width: `${projection.progress.percentage ?? 0}%` }} />
              </div>
              <small>
                {projection.progress.tasksTotal
                  ? `${projection.progress.tasksDone} de ${projection.progress.tasksTotal} tarefas concluídas`
                  : 'Nenhuma tarefa relacionada'}
              </small>
            </>
          )}
        </div>
      </dl>
      {projection && <TraceabilityPhaseTrail projection={projection} />}
    </div>
  );
}
export function TraceabilityWorkspace({ requirement, graph, onClose, onRetry, returnFocusRef }) {
  return createPortal(
    <SprintDialog
      open
      title={`Rastreabilidade — ${requirement.displayId || `REQ-${requirement.id}`}`}
      description={requirement.title}
      className="trace-workspace"
      onClose={onClose}
      returnFocusRef={returnFocusRef}
    >
      <WorkspaceSummary projection={graph.data?.summary} />
      <TraceabilityGuide />
      {graph.loading && <LoadingState message="Carregando requisito selecionado..." />}
      {graph.error && <ErrorState message={graph.error.message} onRetry={onRetry} />}
      {graph.data && <TraceabilityFlow traceability={graph.data} />}
    </SprintDialog>,
    document.body
  );
}
