import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SprintDialog } from '../../schedule/index.js';
import {
  ErrorState,
  LoadingState,
  normalizeApiError,
  TraceFlowIcon
} from '../../../shared/index.js';
import {
  testCasesApi,
  useTestCaseScope,
  useCaseRead,
  TestExecutionWizard,
  ExecutionDetails,
  EvidenceViewer,
  EvidenceDownloadButton,
  useEvidenceContent
} from '../../testCases/index.js';
import { defectsApi } from '../api/defects.api.js';
import { contextualAction, defectLabel } from '../model/defects.js';
import { DefectForm } from './DefectForm.jsx';
import { DefectDetails } from './DefectDetails.jsx';
import { CorrectionManager } from './CorrectionManager.jsx';
import { DefectHistory } from './DefectHistory.jsx';
function Retest({ defect, ...props }) {
  const { data, loading, error, load } = useCaseRead('detail', defect.detection.testCase.id);
  if (loading) return <LoadingState message="Carregando versão atual do caso…" />;
  if (error) return <ErrorState message={error.message} onRetry={() => load()} />;
  if (!data?.capabilities.canExecute)
    return <p role="status">O caso está inativo ou o reteste não está autorizado.</p>;
  return <TestExecutionWizard testCase={data} retest={defect} {...props} />;
}
function Execution({ id, onPreview, onOpenDefect }) {
  const { data, loading, error, load } = useCaseRead('execution', id);
  if (loading) return <LoadingState message="Carregando execução…" />;
  if (error) return <ErrorState message={error.message} onRetry={() => load()} />;
  return (
    data && <ExecutionDetails execution={data} onPreview={onPreview} onOpenDefect={onOpenDefect} />
  );
}
export function DefectFlow({
  projectId,
  initialId,
  initialView = 'details',
  initialExecutionId,
  initialStepId,
  options,
  canWrite,
  embedded = false,
  onHeader,
  onClose,
  onConfirmed,
  returnFocusRef
}) {
  const [id, setId] = useState(initialId),
    [view, setView] = useState(initialId ? initialView : 'create'),
    [row, setRow] = useState(null),
    [loading, setLoading] = useState(Boolean(initialId)),
    [error, setError] = useState(null),
    [mutationError, setMutationError] = useState(null),
    [busy, setBusy] = useState(false),
    [feedback, setFeedback] = useState(''),
    [warning, setWarning] = useState(''),
    [needsRefresh, setNeedsRefresh] = useState(false),
    [executionId, setExecutionId] = useState(null),
    [preview, setPreview] = useState(null);
  const scope = useTestCaseScope(`${projectId}:${id || 'create'}`),
    lock = useRef(false),
    contentRef = useRef(null),
    returnSubview = useRef(null),
    scroll = useRef(0),
    handlers = useRef({}),
    receipt = useRef(null),
    minimumRevision = useRef(null),
    previewContent = useEvidenceContent(preview?.file, projectId);
  const read = useCallback(
    async (refresh = false) => {
      const t = scope.begin('detail');
      if (!refresh) setLoading(true);
      setError(null);
      try {
        const d = await defectsApi.detail(id, { signal: t.controller.signal });
        if (scope.accepts('detail', t)) {
          if (
            (minimumRevision.current?.id === d.id &&
              minimumRevision.current.revision > d.revision) ||
            (receipt.current?.id === d.id && receipt.current.revision > d.revision)
          ) {
            setWarning('Alteração confirmada. A leitura recebida está desatualizada.');
            return;
          }
          setRow(d);
          setNeedsRefresh(false);
          setWarning('');
          return d;
        }
      } catch (e) {
        if (scope.accepts('detail', t)) {
          if (refresh)
            setWarning('Alteração confirmada. Não foi possível atualizar os dados do defeito.');
          else setError(normalizeApiError(e));
        }
      } finally {
        if (scope.accepts('detail', t)) setLoading(false);
      }
    },
    [id, scope]
  );
  useEffect(() => {
    if (id) {
      if (receipt.current?.id === id) {
        setRow(receipt.current);
        void read(true);
      } else {
        setRow(null);
        void read();
      }
    }
  }, [id, read]);
  const close = () => {
    if (!lock.current) onClose();
  };
  const navigate = (next) => {
    if (lock.current) return;
    returnSubview.current = document.activeElement;
    setMutationError(null);
    setView(next);
  };
  const openDefect = (next) => {
    setId(next);
    setView('details');
    setMutationError(null);
  };
  const back = () => {
    if (lock.current) return;
    if (preview) {
      setPreview(null);
      return;
    }
    navigate('details');
  };
  const openPreview = (file, source, trigger) => {
    returnSubview.current = trigger;
    scroll.current = contentRef.current?.parentElement?.scrollTop || 0;
    setPreview({ file, source });
  };
  const openExecution = (next) => {
    setExecutionId(next);
    navigate('execution');
  };
  async function mutate(kind, operation) {
    if (lock.current || !canWrite || needsRefresh) return;
    lock.current = true;
    setBusy(true);
    setMutationError(null);
    setFeedback('');
    const context = scope.capture();
    try {
      const saved = await operation();
      if (!scope.valid(context)) return;
      scope.invalidate();
      if (kind === 'delete') {
        onConfirmed?.('delete', null, id);
        onClose();
        return;
      }
      if (kind === 'retest') {
        minimumRevision.current = { id, revision: row.revision + 1 };
        setNeedsRefresh(true);
        setView('details');
        setFeedback(
          saved.result === 'PASS'
            ? `${saved.displayId || `EXEC-${saved.id}`} · Reteste aprovado. Defeito validado.`
            : saved.result === 'FAIL'
              ? 'Reteste falhou. Um novo ciclo de correção foi iniciado.'
              : 'Reteste registrado como bloqueado. O defeito continua aguardando reteste.'
        );
        onConfirmed?.('retest', null, id);
        const current = await read(true);
        if (current) {
          onConfirmed?.('edit', current, id);
        }
        return;
      }
      receipt.current = saved;
      setRow(saved);
      setView('details');
      onConfirmed?.(kind === 'create' ? 'create' : 'edit', saved, saved.id);
      if (!id) setId(saved.id);
      setFeedback(
        kind === 'correction'
          ? 'Tarefa de correção confirmada.'
          : kind === 'create'
            ? `${saved.displayId} · Defeito registrado.`
            : 'Defeito atualizado.'
      );
    } catch (e) {
      if (!scope.valid(context)) return;
      const err = normalizeApiError(e);
      const blocked = err.status === 409 || err.isNetworkError || err.isTimeout;
      setMutationError({
        ...err,
        blocked,
        message: blocked
          ? `${err.message} Seu rascunho foi preservado. Consulte o registro atualizado antes de tentar novamente.`
          : err.message
      });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  handlers.current = { navigate, close, back, openDefect, mutate };
  const title = preview
    ? preview.file.originalName
    : view === 'create'
      ? 'Registrar defeito'
      : view === 'edit'
        ? `Editar ${row?.displayId || 'defeito'}`
        : view === 'history'
          ? `Histórico · ${row?.displayId || 'Defeito'}`
          : view === 'correction'
            ? `Correção · ${row?.displayId || 'Defeito'}`
            : view === 'retest'
              ? `Reteste do ${row?.displayId || 'defeito'}`
              : view === 'execution'
                ? 'Detalhes da execução'
                : row
                  ? defectLabel(row)
                  : 'Carregando defeito…';
  const description =
    view === 'details'
      ? 'Detalhes do defeito'
      : view === 'history'
        ? 'Evolução do defeito'
        : view === 'correction'
          ? `Gerencie as tarefas do ciclo ${row?.currentCorrectionCycle || ''}`
          : view === 'create'
            ? 'Registre uma falha comprovada em execução de teste'
            : undefined;
  const headerActions = useMemo(
    () =>
      preview ? (
        <EvidenceDownloadButton file={preview.file} />
      ) : view === 'details' && row ? (
        <>
          {canWrite && !needsRefresh && contextualAction(row.status) && (
            <button
              className="button button-primary"
              disabled={busy}
              onClick={() =>
                handlers.current.navigate(
                  row.status === 'AGUARDANDO_RETESTE' ? 'retest' : 'correction'
                )
              }
            >
              {contextualAction(row.status)}
            </button>
          )}
          {canWrite && !needsRefresh && (
            <>
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={() => handlers.current.navigate('edit')}
              >
                Editar
              </button>
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={() => handlers.current.navigate('delete')}
              >
                Excluir
              </button>
            </>
          )}
        </>
      ) : null,
    [preview, view, row, canWrite, needsRefresh, busy]
  );
  const leadingAction = useMemo(
    () =>
      preview || (view !== 'details' && view !== 'create') ? (
        <button
          className="sprint-dialog__close"
          disabled={busy}
          aria-label="Voltar para detalhes do defeito"
          onClick={() => handlers.current.back()}
        >
          <TraceFlowIcon name="arrowLeft" />
        </button>
      ) : embedded ? (
        <button
          className="sprint-dialog__close"
          disabled={busy}
          aria-label="Voltar para detalhes da execução"
          onClick={() => handlers.current.close()}
        >
          <TraceFlowIcon name="arrowLeft" />
        </button>
      ) : null,
    [preview, view, busy, embedded]
  );
  useLayoutEffect(() => {
    onHeader?.({ title, description, headerActions, leadingAction, busy });
  }, [title, description, headerActions, leadingAction, busy, onHeader]);
  useLayoutEffect(() => {
    if (!preview && view === 'details' && returnSubview.current?.isConnected) {
      returnSubview.current.focus({ preventScroll: true });
      if (contentRef.current?.parentElement)
        contentRef.current.parentElement.scrollTop = scroll.current;
    } else contentRef.current?.focus({ preventScroll: true });
  }, [view, preview]);
  const body = (
    <div
      className="tc-modal tc-modal-content tc-stack"
      ref={contentRef}
      tabIndex={-1}
      data-defect-modal
    >
      {feedback && (
        <p className="tc-feedback" role="status">
          {feedback}
        </p>
      )}
      {warning && (
        <p className="tc-notice" role="status">
          {warning}
          <button className="button button-secondary" onClick={() => read(true)}>
            Atualizar defeito
          </button>
        </p>
      )}
      {mutationError && (
        <p className="tc-notice" role="alert">
          {mutationError.message}
        </p>
      )}
      {preview && (
        <EvidenceViewer
          file={preview.file}
          source={preview.source}
          content={previewContent}
          onBack={back}
        />
      )}
      <div hidden={Boolean(preview)}>
        {loading && <LoadingState message="Carregando defeito…" />}
        {error && <ErrorState message={error.message} onRetry={() => read()} />}
        {view === 'create' && canWrite && (
          <DefectForm
            projectId={projectId}
            initialExecutionId={initialExecutionId}
            initialStepId={initialStepId}
            options={options}
            busy={busy}
            blocked={mutationError?.blocked}
            onSave={(p) => mutate('create', () => defectsApi.create(projectId, p))}
            onCancel={close}
            onOpenDefect={openDefect}
          />
        )}
        {row && !loading && !error && (
          <>
            {view === 'details' && (
              <DefectDetails
                defect={row}
                canWrite={canWrite && !needsRefresh}
                onView={navigate}
                onPreview={openPreview}
                onNavigate={close}
                onExecution={openExecution}
              />
            )}
            {view === 'edit' && canWrite && (
              <DefectForm
                key={row.id}
                projectId={projectId}
                defect={row}
                options={options}
                busy={busy}
                blocked={mutationError?.blocked}
                onSave={(p) => mutate('edit', () => defectsApi.update(id, p))}
                onCancel={back}
                onOpenDefect={openDefect}
              />
            )}
            {view === 'correction' && canWrite && row.status !== 'VALIDADO' && (
              <CorrectionManager
                defect={row}
                options={options}
                busy={busy}
                blocked={mutationError?.blocked}
                onSave={(p) =>
                  mutate('correction', () =>
                    defectsApi.correction(id, {
                      ...p,
                      expectedRevision: row.revision,
                      correctionCycle: row.currentCorrectionCycle
                    })
                  )
                }
              />
            )}
            {view === 'history' && <DefectHistory id={id} onExecution={openExecution} />}
            {view === 'execution' && (
              <Execution
                key={executionId}
                id={executionId}
                onPreview={openPreview}
                onOpenDefect={openDefect}
              />
            )}
            {view === 'retest' && canWrite && row.status === 'AGUARDANDO_RETESTE' && (
              <Retest
                defect={row}
                busy={busy}
                blocked={mutationError?.blocked}
                onCancel={back}
                onRegister={(body) =>
                  mutate('retest', () => testCasesApi.record(row.detection.testCase.id, body))
                }
              />
            )}
            {view === 'delete' && canWrite && (
              <section className="tc-stack">
                <h3>Excluir {row.displayId}?</h3>
                <p>
                  O defeito deixará de aparecer nas visões atuais. O histórico, as execuções de
                  teste e as tarefas relacionadas serão preservados.
                </p>
                <footer className="tc-footer">
                  <button className="button button-secondary" disabled={busy} onClick={back}>
                    Cancelar
                  </button>
                  <button
                    className="button button-danger"
                    disabled={busy}
                    onClick={() => mutate('delete', () => defectsApi.remove(id))}
                  >
                    Excluir defeito
                  </button>
                </footer>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
  return embedded ? (
    body
  ) : (
    <SprintDialog
      open
      title={title}
      description={description}
      headerActions={headerActions}
      leadingAction={leadingAction}
      size="large"
      className="tc-dialog defect-dialog"
      busy={busy}
      onClose={close}
      returnFocusRef={returnFocusRef}
      initialFocusSelector="[data-defect-modal]"
    >
      {body}
    </SprintDialog>
  );
}
