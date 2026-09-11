import { useCallback, useEffect, useRef, useState } from 'react';
import { TaskDetailsPanel, tasksApi } from '../../tasks/index.js';
import { DefectFlow } from '../../defects/index.js';
import {
  TestCaseDialogContent,
  useTestCaseScope,
  EvidenceViewer,
  useEvidenceContent
} from '../../testCases/index.js';
import { ErrorState, LoadingState, normalizeApiError } from '../../../shared/index.js';
import { identity } from '../model/graph.js';
function TaskInspection({ node, projectId, onClose, returnFocusRef }) {
  const scope = useTestCaseScope(`${projectId}:${node.data.id}`);
  const [state, setState] = useState({ loading: true });
  const read = useCallback(async () => {
    const t = scope.begin('task');
    setState({ loading: true });
    try {
      const response = await tasksApi.get(node.data.id, { signal: t.controller.signal });
      if (scope.accepts('task', t)) setState({ data: response.data.task, loading: false });
    } catch (e) {
      if (scope.accepts('task', t)) setState({ error: normalizeApiError(e), loading: false });
    }
  }, [node.data.id, scope]);
  useEffect(() => {
    void read();
  }, [read]);
  if (state.data)
    return (
      <TaskDetailsPanel
        embedded
        task={state.data}
        projectId={projectId}
        onClose={onClose}
        returnFocusRef={returnFocusRef}
      />
    );
  return (
    <ContentShell open title={identity(node)} onClose={onClose} returnFocusRef={returnFocusRef}>
      {state.loading ? (
        <LoadingState message="Carregando tarefa…" />
      ) : (
        <ErrorState message={state.error.message} onRetry={read} />
      )}
    </ContentShell>
  );
}
function QualityInspection({ node, projectId, onClose, returnFocusRef }) {
  const [dialog, setDialog] = useState({
    type: node.type === 'TEST_EXECUTION' ? 'execution' : 'details',
    caseId: node.type === 'TEST_EXECUTION' ? node.data.testCaseId : node.data.id,
    executionId: node.type === 'TEST_EXECUTION' ? node.data.id : undefined
  });
  const [preview, setPreview] = useState(null),
    [defect, setDefect] = useState(null);
  const previewFocus = useRef(null);
  const evidence = useEvidenceContent(preview?.file, projectId);
  const back = useCallback(() => {
    setPreview(null);
    queueMicrotask(() => previewFocus.current?.focus());
  }, []);
  if (defect)
    return (
      <EmbeddedDefect
        key={defect}
        projectId={projectId}
        initialId={defect}
        embeddedReturnLabel="Voltar à execução"
        canWrite={false}
        onClose={() => setDefect(null)}
        returnFocusRef={returnFocusRef}
      />
    );
  return (
    <ContentShell
      open
      title={
        preview
          ? preview.file.originalName
          : dialog.type === 'execution'
            ? `EXEC-${String(dialog.executionId).padStart(4, '0')}`
            : `${identity(node)} · ${node.data.title || 'Caso de teste'}`
      }
      description="Consulta da rastreabilidade"
      onClose={onClose}
      returnFocusRef={returnFocusRef}
    >
      <div className="tc-modal tc-modal-content tc-stack">
        {preview && (
          <EvidenceViewer
            file={preview.file}
            source={preview.source}
            content={evidence}
            onBack={back}
          />
        )}
        <div hidden={Boolean(preview)}>
          {dialog.type !== 'details' && node.type === 'TEST_CASE' && (
            <button
              className="button button-secondary"
              onClick={() => setDialog((d) => ({ ...d, type: 'details' }))}
            >
              Voltar ao caso de teste
            </button>
          )}
          <TestCaseDialogContent
            key={`${dialog.type}:${dialog.executionId}`}
            dialog={dialog}
            projectId={projectId}
            canWrite={false}
            onCancel={onClose}
            onView={(type, executionId) => setDialog((d) => ({ ...d, type, executionId }))}
            onPreview={(file, source, trigger) => {
              previewFocus.current = trigger;
              setPreview({ file, source });
            }}
            onOpenDefect={setDefect}
          />
        </div>
      </div>
    </ContentShell>
  );
}
function ContentShell({ title, children }) {
  return (
    <section className="trace-detail-content">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
function EmbeddedDefect(props) {
  const [header, setHeader] = useState(null);
  return (
    <section className="trace-detail-content">
      <header>
        <h3>{header?.title}</h3>
        {header?.leadingAction}
        {header?.headerActions}
      </header>
      <DefectFlow embeddedReturnLabel={null} {...props} embedded onHeader={setHeader} />
    </section>
  );
}
export function GraphEntityDetails(props) {
  const { node } = props;
  return node.type === 'TASK' ? (
    <TaskInspection {...props} />
  ) : node.type === 'DEFECT' ? (
    <EmbeddedDefect
      projectId={props.projectId}
      initialId={node.data.id}
      canWrite={false}
      onClose={props.onClose}
    />
  ) : (
    <QualityInspection {...props} />
  );
}
