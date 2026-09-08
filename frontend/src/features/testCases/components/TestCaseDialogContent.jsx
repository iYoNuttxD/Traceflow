import { useEffect, useState } from 'react';
import { ErrorState, LoadingState } from '../../../shared/index.js';
import { useCaseRead } from '../hooks/useCaseRead.js';
import { TestCaseForm } from './TestCaseForm.jsx';
import { TestExecutionWizard } from './TestExecutionWizard.jsx';
import { ExecutionDetails, TestCaseDetails } from './TestCaseDetails.jsx';
import { TestCaseHistory } from './TestCaseHistory.jsx';

function LoadedCase({ id, type, canWrite, headerKey, onLoaded, ...props }) {
  const { data, loading, error, load } = useCaseRead('detail', id);
  useEffect(() => {
    if (data) onLoaded?.(headerKey, data);
  }, [data, headerKey, onLoaded]);
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
function LoadedExecution({ id, headerKey, onLoaded, onPreview, ...props }) {
  const { data, loading, error, load } = useCaseRead('execution', id);
  useEffect(() => {
    if (data) onLoaded?.(headerKey, data);
  }, [data, headerKey, onLoaded]);
  if (loading) return <LoadingState message="Carregando execução…" />;
  if (error) return <ErrorState message={error.message} onRetry={() => load()} />;
  const receipt = props.defectReceipt;
  const presented =
    data && receipt?.length
      ? {
          ...data,
          steps: data.steps.map((step) => ({
            ...step,
            detectedDefects: receipt.reduce((items, entry) => {
              if (entry.kind === 'delete') return items.filter((d) => d.id !== entry.id);
              if (entry.saved?.detectedExecutionStepId !== step.id) return items;
              return [...items.filter((d) => d.id !== entry.saved.id), entry.saved];
            }, step.detectedDefects || [])
          }))
        }
      : data;
  return presented && <ExecutionDetails execution={presented} onPreview={onPreview} {...props} />;
}
export function TestCaseDialogContent({ dialog, mutationError, headerKey, onLoaded, ...props }) {
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
            <LoadedExecution
              key={consultExecution}
              id={consultExecution}
              onPreview={props.onPreview}
            />
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
            headerKey={headerKey}
            onLoaded={onLoaded}
            {...props}
            serverErrors={mutationError?.fieldErrors}
          />
        )}
        {dialog.type === 'history' && <TestCaseHistory id={dialog.caseId} onSelect={onSelect} />}
        {dialog.type === 'execution' && (
          <LoadedExecution
            id={dialog.executionId}
            headerKey={headerKey}
            onLoaded={onLoaded}
            onPreview={props.onPreview}
            defectReceipt={props.defectReceipt}
            canWrite={props.canWrite}
            onCreateDefect={props.onCreateDefect}
            onOpenDefect={props.onOpenDefect}
          />
        )}
      </div>
    </>
  );
}
