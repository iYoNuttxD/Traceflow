import { useState } from 'react';
import { ErrorState, LoadingState } from '../../../shared/index.js';
import { useCaseRead } from '../hooks/useCaseRead.js';
import { TestCaseForm } from './TestCaseForm.jsx';
import { TestExecutionWizard } from './TestExecutionWizard.jsx';
import { ExecutionDetails, TestCaseDetails } from './TestCaseDetails.jsx';
import { TestCaseHistory } from './TestCaseHistory.jsx';

function LoadedCase({ id, type, canWrite, ...props }) {
  const { data, loading, error, load } = useCaseRead('detail', id);
  if (loading) return <LoadingState message="Carregando caso de teste…" />;
  if (error) return <ErrorState message={error.message} onRetry={() => load()} />;
  if (!data) return null;
  if (type === 'edit' && canWrite && data.capabilities.canEdit)
    return <TestCaseForm testCase={data} {...props} />;
  if (type === 'execute' && canWrite && data.capabilities.canExecute)
    return <TestExecutionWizard testCase={data} {...props} />;
  if (type !== 'details')
    return (
      <p role="status">
        Esta ação não está disponível. O caso pode estar inativo ou sua permissão mudou.
      </p>
    );
  return (
    <TestCaseDetails testCase={data} canWrite={canWrite && data.capabilities.canEdit} {...props} />
  );
}
function LoadedExecution({ id, onBack }) {
  const { data, loading, error, load } = useCaseRead('execution', id);
  if (loading) return <LoadingState message="Carregando execução…" />;
  if (error) return <ErrorState message={error.message} onRetry={() => load()} />;
  return (
    data && (
      <>
        {onBack && (
          <button className="tc-history-back" aria-label="Voltar ao histórico" onClick={onBack}>
            ‹ Execuções / {data.displayId}
          </button>
        )}
        <ExecutionDetails execution={data} />
      </>
    )
  );
}
export function TestCaseDialogContent({ dialog, mutationError, ...props }) {
  const [consulting, setConsulting] = useState(false);
  const [consultExecution, setConsultExecution] = useState(null);
  const onSelect = (executionId) => props.onView('execution', executionId);
  return (
    <>
      {mutationError && (
        <div className="tc-notice" role="alert">
          <span>{mutationError.message}</span>
          {mutationError.requestId && <small>Referência: {mutationError.requestId}</small>}
          {mutationError.uncertain && dialog.caseId && (
            <button className="button button-secondary" onClick={() => setConsulting(true)}>
              Consultar histórico antes de tentar novamente
            </button>
          )}
        </div>
      )}
      {consulting && (
        <section className="tc-stack">
          <button
            className="tc-history-back"
            onClick={() => {
              setConsulting(false);
              setConsultExecution(null);
            }}
          >
            ‹ Voltar ao rascunho preservado
          </button>
          {consultExecution ? (
            <LoadedExecution key={consultExecution} id={consultExecution} />
          ) : (
            <TestCaseHistory id={dialog.caseId} onSelect={setConsultExecution} />
          )}
        </section>
      )}
      <div hidden={consulting}>
        {dialog.type === 'create' && (
          <TestCaseForm {...props} serverErrors={mutationError?.fieldErrors} />
        )}
        {['details', 'edit', 'execute'].includes(dialog.type) && (
          <LoadedCase
            id={dialog.caseId}
            type={dialog.type}
            {...props}
            serverErrors={mutationError?.fieldErrors}
          />
        )}
        {dialog.type === 'history' && <TestCaseHistory id={dialog.caseId} onSelect={onSelect} />}
        {dialog.type === 'execution' && (
          <LoadedExecution id={dialog.executionId} onBack={() => props.onView('history')} />
        )}
      </div>
    </>
  );
}
