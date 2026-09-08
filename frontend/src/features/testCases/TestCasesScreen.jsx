import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useParams } from 'react-router';
import { ProjectSectionNav, useProjectsCatalog } from '../projects/index.js';
import { SprintDialog } from '../schedule/index.js';
import {
  useConfirm,
  ContextualErrorPage,
  ErrorState,
  LoadingState,
  PAGE_ERROR_TYPES,
  normalizeApiError
} from '../../shared/index.js';
import { useTestCases } from './hooks/useTestCases.js';
import { testCasesApi } from './api/test-cases.api.js';
import {
  NewCaseCard,
  TestCaseCard,
  TestCaseFilters,
  TestCaseSummary
} from './components/TestCaseList.jsx';
import { TestCaseDialogContent } from './components/TestCaseDialogContent.jsx';
import './styles/test-cases.css';

export function TestCasesScreen() {
  const { projectId } = useParams();
  const { projects, loading, error, refreshProjects } = useProjectsCatalog();
  if (loading) return <LoadingState message="Carregando contexto do projeto..." />;
  if (error) return <ContextualErrorPage error={error} onRetry={refreshProjects} />;
  const project = projects.find((item) => String(item.id) === projectId);
  if (!project) return <ContextualErrorPage type={PAGE_ERROR_TYPES.NOT_FOUND} showRetry={false} />;
  return <ProjectTestCases key={projectId} project={project} />;
}
function ProjectTestCases({ project }) {
  const state = useTestCases(project.id);
  const confirm = useConfirm();
  const listRef = useRef(null);
  const returnFocusRef = useRef(null);
  const modalContentRef = useRef(null);
  const mutationLock = useRef(false);
  const confirmationLock = useRef(false);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [mutationError, setMutationError] = useState(null);
  const [selected, setSelected] = useState({ requirement: null, task: null });
  const canWrite = ['MEMBER', 'MANAGER', 'OWNER'].includes(state.membership?.role);
  const close = useCallback(() => {
    if (!mutationLock.current) {
      setDialog(null);
      setMutationError(null);
    }
  }, []);
  async function mutate(kind, operation, id) {
    if (mutationLock.current || !canWrite) return;
    mutationLock.current = true;
    setBusy(true);
    setMutationError(null);
    setFeedback('');
    const context = state.scope.capture();
    try {
      const saved = await operation();
      if (!state.scope.valid(context)) return;
      state.confirmed(kind, saved, id);
      setDialog(null);
      setFeedback(
        kind === 'execute'
          ? `${saved.displayId} · Execução registrada: ${saved.result}.`
          : kind === 'delete'
            ? 'Caso excluído. Histórico e evidências preservados.'
            : `${saved.displayId} · Caso salvo (v${saved.currentVersion}).`
      );
    } catch (e) {
      if (!state.scope.valid(context)) return;
      const error = normalizeApiError(e, 'Não foi possível concluir a operação.');
      const conflict = error.code === 'TEST_CASE_VERSION_CONFLICT';
      const uncertain = error.isNetworkError || error.isTimeout || !error.status;
      const message = conflict
        ? 'O caso foi atualizado por outra pessoa. Seu rascunho foi preservado. Revise-o e feche este diálogo para recarregar a versão atual antes de salvar novamente.'
        : uncertain
          ? 'Não foi possível confirmar a resposta. A operação pode ter sido registrada. Consulte o histórico antes de tentar novamente; seu rascunho foi preservado.'
          : error.message;
      setMutationError({ ...error, message, uncertain, blocked: conflict || uncertain });
    } finally {
      mutationLock.current = false;
      // The mutation itself invalidates reads on success; project identity still owns feedback.
      if (state.scope.valid(state.scope.capture())) setBusy(false);
    }
  }
  async function deleteCase(item, trigger, previousDialog = null) {
    if (confirmationLock.current || mutationLock.current || !canWrite) return;
    confirmationLock.current = true;
    const context = state.scope.capture();
    flushSync(() => setDialog(null));
    if (trigger?.isConnected) trigger.focus();
    const accepted = await confirm({
      title: 'Excluir caso de teste?',
      description: `${item.displayId} · ${item.title}. O caso sairá das listas. O histórico de execuções e as evidências serão preservados.`,
      confirmLabel: 'Excluir caso',
      cancelLabel: 'Cancelar',
      destructive: true,
      focusAfterConfirmRef: listRef
    });
    confirmationLock.current = false;
    if (!state.scope.valid(context)) return;
    if (accepted) await mutate('delete', () => testCasesApi.remove(item.id), item.id);
    else if (previousDialog) {
      setDialog(previousDialog);
      requestAnimationFrame(() =>
        modalContentRef.current?.querySelector('[data-delete-case]')?.focus()
      );
    }
  }
  function open(type, item, trigger) {
    if (mutationLock.current) return;
    if (type === 'delete') {
      void deleteCase(item, trigger);
      return;
    }
    returnFocusRef.current = trigger || document.activeElement;
    setMutationError(null);
    setDialog({ type, caseId: item?.id, label: item?.displayId, title: item?.title });
  }
  function switchView(type, executionId) {
    if (mutationLock.current) return;
    setMutationError(null);
    setDialog((old) => ({ ...old, type, executionId }));
  }
  useEffect(() => {
    if (dialog) {
      modalContentRef.current?.focus({ preventScroll: true });
      const body = modalContentRef.current?.parentElement;
      if (body) body.scrollTop = 0;
    }
  }, [dialog]);
  const title =
    dialog?.type === 'create'
      ? 'Criar caso de teste'
      : dialog?.type === 'edit'
        ? 'Editar caso de teste'
        : dialog?.type === 'execute'
          ? `Executar ${dialog.label}`
          : dialog?.type === 'history'
            ? 'Histórico do caso'
            : dialog?.type === 'execution'
              ? 'Detalhes da execução'
              : dialog
                ? `${dialog.label} · ${dialog.title}`
                : '';
  if ([403, 404].includes(state.error?.status) || [403, 404].includes(state.memberError?.status))
    return <ContextualErrorPage error={state.error || state.memberError} showRetry={false} />;
  return (
    <div className="page-container sprints-screen tc-screen">
      <div inert={dialog || busy ? true : undefined}>
        <header className="page-header sprints-screen__header">
          <div>
            <span className="eyebrow">Testes</span>
            <h1>Casos de teste</h1>
            <p>
              Defina cenários de validação, execute testes e acompanhe o histórico das verificações.
            </p>
          </div>
          <ProjectSectionNav projectId={project.id} activeSection="test-cases" />
        </header>
        {feedback && (
          <p role="status" className="tc-feedback">
            {feedback}
          </p>
        )}
        {state.warning && (
          <div className="tc-notice" role="status">
            {state.warning}
            <button className="button button-secondary" onClick={() => state.load(1, true)}>
              Atualizar lista
            </button>
          </div>
        )}
        {mutationError && !dialog && (
          <p className="field-error" role="alert">
            {mutationError.message}
          </p>
        )}
        {state.memberError && (
          <ErrorState message={state.memberError.message} onRetry={state.loadMembers} />
        )}
        <TestCaseSummary summary={state.catalog.summary} />
        <TestCaseFilters
          filters={state.filters}
          onChange={state.changeFilter}
          onClear={() => {
            setSelected({ requirement: null, task: null });
            state.clearFilters();
          }}
          count={state.catalog.total}
          total={state.catalog.summary?.total ?? 0}
          members={state.members}
          searchRequirements={state.searchRequirements}
          searchTasks={state.searchTasks}
          selected={selected}
          onSelect={(key, item) => {
            setSelected((old) => ({ ...old, [key]: item }));
            state.changeFilter(key === 'requirement' ? 'requirementId' : 'taskId', item?.id || '');
          }}
        />
        {state.loading && <LoadingState message="Carregando casos de teste…" />}
        {state.error && (
          <ErrorState
            message={state.error.message}
            onRetry={() => state.load(state.catalog.page ? state.catalog.page + 1 : 1)}
          />
        )}
        <section
          ref={listRef}
          tabIndex={-1}
          aria-label="Casos de teste"
          className="sprint-grid tc-grid"
          role="list"
        >
          {canWrite && (
            <div role="listitem">
              <NewCaseCard onOpen={open} />
            </div>
          )}
          {state.catalog.items.map((item) => (
            <div key={item.id} role="listitem">
              <TestCaseCard testCase={item} canWrite={canWrite} onOpen={open} />
            </div>
          ))}
        </section>
        {!state.loading && !state.error && !state.catalog.items.length && (
          <div className="tc-surface">
            <p role="status">
              {Object.values(state.filters).some(Boolean)
                ? 'Nenhum caso corresponde aos filtros.'
                : 'Nenhum caso de teste cadastrado.'}
            </p>
            {Object.values(state.filters).some(Boolean) && (
              <button
                className="button button-secondary"
                onClick={() => {
                  setSelected({ requirement: null, task: null });
                  state.clearFilters();
                }}
              >
                Limpar filtros
              </button>
            )}
          </div>
        )}
        {state.catalog.items.length < state.catalog.total && (
          <button
            className="button button-secondary"
            disabled={state.loadingMore || state.loading}
            onClick={() => state.load(state.catalog.page + 1)}
          >
            {state.loadingMore ? 'Carregando…' : 'Carregar mais casos'}
          </button>
        )}
      </div>
      <SprintDialog
        open={Boolean(dialog)}
        title={title}
        size="large"
        onClose={close}
        busy={busy}
        returnFocusRef={returnFocusRef}
        initialFocusSelector="[data-tc-modal]"
      >
        {dialog && (
          <div
            ref={modalContentRef}
            tabIndex={-1}
            data-tc-modal
            className="tc-modal tc-modal-content"
          >
            <TestCaseDialogContent
              key={`${dialog.type}:${dialog.caseId}:${dialog.executionId || ''}`}
              dialog={dialog}
              mutationError={mutationError}
              busy={busy}
              blocked={mutationError?.blocked}
              canWrite={canWrite}
              members={state.members}
              searchRequirements={state.searchRequirements}
              searchTasks={state.searchTasks}
              onCancel={close}
              onSave={(payload) =>
                mutate(
                  dialog.type === 'create' ? 'create' : 'edit',
                  () =>
                    dialog.type === 'create'
                      ? testCasesApi.create(project.id, payload)
                      : testCasesApi.update(dialog.caseId, payload),
                  dialog.caseId
                )
              }
              onRegister={(body) =>
                mutate('execute', () => testCasesApi.record(dialog.caseId, body), dialog.caseId)
              }
              onView={switchView}
              onDelete={(event) =>
                deleteCase(
                  { id: dialog.caseId, displayId: dialog.label, title: dialog.title },
                  event.currentTarget,
                  dialog
                )
              }
            />
          </div>
        )}
      </SprintDialog>
    </div>
  );
}
