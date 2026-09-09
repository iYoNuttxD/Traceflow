import { DetailSurface, EntityRow } from '../../../shared/index.js';
import { environments, referenceLabel } from '../model/test-cases.js';
import { Badge } from './Parts.jsx';

export function ExecutionSummary({
  title = 'Última execução',
  execution,
  state = 'NEVER',
  message,
  children,
  onExecution
}) {
  const reference = execution?.testedReference || execution?.testedReferenceSnapshot;
  return (
    <DetailSurface title={title}>
      <div className="execution-summary__status">
        <Badge value={execution?.result || state} />
      </div>
      {execution && (
        <EntityRow
          identity={execution.displayId || `EXEC-${String(execution.id).padStart(4, '0')}`}
          disabled={!onExecution}
          onClick={onExecution ? () => onExecution(execution.id) : undefined}
        >
          <span>{new Date(execution.executedAt).toLocaleString('pt-BR')}</span>
          {execution.environment && <span>{environments[execution.environment]}</span>}
          {execution.executedByDisplayNameSnapshot && (
            <span>{execution.executedByDisplayNameSnapshot}</span>
          )}
          {reference && <span>{referenceLabel(reference)}</span>}
          {execution.testCaseVersion && <span>Caso v{execution.testCaseVersion}</span>}
        </EntityRow>
      )}
      {message && <p>{message}</p>}
      {children}
    </DetailSurface>
  );
}
