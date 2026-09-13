import { DefectHeaderActions } from './DefectHeaderActions.jsx';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SprintDialog } from '../../schedule/index.js';
import {
  ErrorState,
  LoadingState,
  normalizeApiError,
  TraceFlowIcon,
  ConfirmDialogContent
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
import { defectLabel } from '../model/defects.js';
import { DefectForm } from './DefectForm.jsx';
import { DefectDetails } from './DefectDetails.jsx';
import { CorrectionTaskForm } from './CorrectionTaskForm.jsx';
import { DefectHistory } from './DefectHistory.jsx';
function Retest({ defect, ...props }) {
  const { data, loading, error, load } = useCaseRead('detail', defect.detection.testCase.id);
  if (loading) return <LoadingState message="Carregando versão atual do caso…" />;
  if (error) return <ErrorState message={error.message} onRetry={() => load()} />;
  if (!data?.capabilities.canExecute)
    return <p role="status">O caso está inativo ou o reteste não está autorizado.</p>;
  return <TestExecutionWizard testCase={data} retest={defect} {...props} />;
}
function Execution({ id, onPreview, onOpenDefect, onLoaded }) {
  const { data, loading, error, load } = useCaseRead('execution', id);
  useEffect(() => {
    if (data) onLoaded(data);
  }, [data, onLoaded]);
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
  initialSection,
  initialExecutionId,
  initialStepId,
  options,
  canWrite,
  embedded = false,
  embeddedReturnLabel = 'Voltar para detalhes da execução',
  onHeader,
  onClose,
  onConfirmed,
  returnFocusRef
}) {
  const [id, setId] = useState(initialId),
    [view, setView] = useState(initialId ? initialView : 'create'),
    [loadedExecution, setLoadedExecution] = useState(null),
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
    returnLabel = useRef(null),
    scroll = useRef(0),
    handlers = useRef({}),
    receipt = useRef(null),
    minimumRevision = useRef(null),
    correctionEntry = useRef(initialSection === 'correction'),
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
    correctionEntry.current = false;
    if (view === 'details') {
      returnSubview.current = document.activeElement;
      returnLabel.current =
        document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent;
      scroll.current = contentRef.current?.parentElement?.scrollTop || 0;
    }
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
    setMutationError(null);
    setView('details');
  };
  const openPreview = (file, source, trigger) => {
    returnSubview.current = trigger;
    scroll.current = contentRef.current?.parentElement?.scrollTop || 0;
    setPreview({ file, source });
  };
  const openExecution = (next) => {
    setLoadedExecution(null);
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
  handlers.current = {
    navigate,
    close,
    back,
    openDefect,
    mutate,
    dialogClose: view === 'delete' ? back : close
  };
  // Keep the dialog lifetime stable while its subview changes. Otherwise its
  // cleanup restores an older focus target after the subview restores its CTA.
  const dialogClose = useCallback(() => handlers.current.dialogClose(), []);
  const title = preview
    ? preview.file.originalName
    : view === 'create'
      ? 'Registrar defeito'
      : view === 'edit'
        ? `Editar ${row?.displayId || 'defeito'}`
        : view === 'history'
          ? `Histórico — ${row ? defectLabel(row) : 'Defeito'}`
          : view === 'correction-create' || view === 'correction-link'
            ? view === 'correction-create'
              ? 'Criar tarefa de correção'
              : 'Vincular tarefa existente'
            : view === 'retest'
              ? `Reteste do ${row?.displayId || 'defeito'}`
              : view === 'execution'
                ? loadedExecution?.displayId || 'Carregando execução…'
                : row
                  ? defectLabel(row)
                  : 'Carregando defeito…';
  const description =
    view === 'details'
      ? 'Detalhes do defeito'
      : view === 'history'
        ? 'Alterações registradas para este defeito.'
        : view === 'correction-create' || view === 'correction-link'
          ? `${row?.displayId || 'Defeito'} · Ciclo ${row?.currentCorrectionCycle || ''}`
          : view === 'edit'
            ? 'Atualize as informações e os vínculos do defeito.'
            : view === 'execution'
              ? loadedExecution
                ? `Detalhes da execução · ${row?.retests.some((r) => r.testExecutionId === loadedExecution.id) ? `Reteste de ${row.displayId} · ` : ''}TC-${loadedExecution.testCaseId} · ${loadedExecution.caseVersionSnapshot.title}`
                : 'Carregando registro histórico'
              : view === 'create'
                ? 'Registre uma falha comprovada em execução de teste'
                : undefined;
  const headerActions = useMemo(
    () =>
      preview ? (
        <EvidenceDownloadButton file={preview.file} />
      ) : view === 'details' && row ? (
        canWrite && !needsRefresh ? (
          <DefectHeaderActions
            defect={row}
            busy={busy}
            onView={(next) => handlers.current.navigate(next)}
          />
        ) : null
      ) : null,
    [preview, view, row, canWrite, needsRefresh, busy]
  );
  const leadingAction = useMemo(
    () =>
      preview || (view !== 'details' && view !== 'create' && view !== 'delete') ? (
        <button
          className="sprint-dialog__close"
          disabled={busy}
          aria-label={
            view.startsWith('correction-')
              ? `Voltar para ${row?.displayId || 'defeito'}`
              : 'Voltar para detalhes do defeito'
          }
          onClick={() => handlers.current.back()}
        >
          <TraceFlowIcon name="arrowLeft" />
        </button>
      ) : embedded && embeddedReturnLabel ? (
        <button
          className="sprint-dialog__close"
          disabled={busy}
          aria-label={embeddedReturnLabel}
          onClick={() => handlers.current.close()}
        >
          <TraceFlowIcon name="arrowLeft" />
        </button>
      ) : null,
    [preview, view, busy, embedded, embeddedReturnLabel, row?.displayId]
  );
  useLayoutEffect(() => {
    onHeader?.({
      title,
      description,
      headerActions,
      leadingAction,
      busy,
      confirmation: view === 'delete'
    });
  }, [title, description, headerActions, leadingAction, busy, onHeader, view]);
  useLayoutEffect(() => {
    if (view === 'delete') return;
    if (!preview && view === 'details') {
      const fallback = [
        ...(contentRef.current?.closest('[role="dialog"]')?.querySelectorAll('button, a') || [])
      ].find((e) => (e.getAttribute('aria-label') || e.textContent) === returnLabel.current);
      const target = returnSubview.current?.isConnected ? returnSubview.current : fallback;
      (target || contentRef.current)?.focus({ preventScroll: true });
      if (contentRef.current?.parentElement)
        contentRef.current.parentElement.scrollTop = scroll.current;
    } else {
      if (contentRef.current?.parentElement) contentRef.current.parentElement.scrollTop = 0;
      contentRef.current?.focus({ preventScroll: true });
    }
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
                focusCorrection={correctionEntry.current}
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
            {['correction-create', 'correction-link'].includes(view) &&
              canWrite &&
              row.status !== 'VALIDADO' && (
                <CorrectionTaskForm
                  defect={row}
                  mode={view === 'correction-create' ? 'create' : 'link'}
                  onCancel={back}
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
                onLoaded={setLoadedExecution}
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
          </>
        )}
      </div>
    </div>
  );
  const content =
    view === 'delete' && row && canWrite ? (
      <>
        <ConfirmDialogContent
          dialog={{
            title: 'Excluir defeito?',
            description: `${defectLabel(row)}. O defeito deixará de aparecer nas visões atuais. O histórico, as execuções de teste e as tarefas relacionadas serão preservados.`,
            confirmLabel: busy ? 'Excluindo…' : 'Excluir defeito',
            destructive: true,
            busy
          }}
          close={(accepted) => {
            if (!busy) {
              if (accepted) void mutate('delete', () => defectsApi.remove(id));
              else back();
            }
          }}
        />
        {mutationError && <p role="alert">{mutationError.message}</p>}
      </>
    ) : (
      body
    );
  return embedded ? (
    content
  ) : (
    <SprintDialog
      open
      confirmation={view === 'delete' && Boolean(row)}
      title={title}
      description={description}
      headerActions={headerActions}
      leadingAction={leadingAction}
      size={view === 'history' ? 'default' : 'large'}
      className="tc-dialog defect-dialog"
      busy={busy}
      onClose={dialogClose}
      returnFocusRef={returnFocusRef}
      initialFocusSelector="[data-defect-modal]"
    >
      {content}
    </SprintDialog>
  );
}
