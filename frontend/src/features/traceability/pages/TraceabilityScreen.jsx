import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { getRequirementTraceability } from '../api/traceability.api.js';
import {
  ContextualErrorPage,
  EmptyState,
  ErrorState,
  LoadingState,
  classifyPageError,
  getErrorRequestId,
  normalizeApiError
} from '../../../shared/index.js';
import { ProjectSectionNav } from '../../projects/index.js';
import { SprintDialog } from '../../schedule/index.js';
import { useTestCaseScope } from '../../testCases/index.js';
import { TraceabilityFlow } from '../components/TraceabilityFlow.jsx';
import {
  RequirementCard,
  RequirementFilters,
  RequirementSummary
} from '../components/RequirementCatalog.jsx';
import { RequirementHistory } from '../components/RequirementHistory.jsx';
import { useRequirementCatalog } from '../hooks/useRequirementCatalog.js';
import '../../schedule/pages/SprintsScreen.css';
import './TraceabilityScreen.css';

export function TraceabilityScreen() {
  const { projectId } = useParams();
  return <ProjectTraceability key={projectId} projectId={projectId} />;
}
function ProjectTraceability({ projectId }) {
  const catalog = useRequirementCatalog(projectId);
  const scope = useTestCaseScope(projectId);
  const [selected, setSelected] = useState(null);
  const [graph, setGraph] = useState({ data: null, error: null, loading: false });
  const [history, setHistory] = useState(null);
  const returnFocusRef = useRef(null);
  const flowHeading = useRef(null);
  const closeHistory = useCallback(() => setHistory(null), []);
  const loadGraph = useCallback(
    async (requirement) => {
      const token = scope.begin('graph');
      setGraph({ data: null, error: null, loading: true });
      try {
        const data = await getRequirementTraceability(
          projectId,
          requirement.id,
          {},
          { signal: token.controller.signal }
        );
        if (scope.accepts('graph', token)) setGraph({ data, error: null, loading: false });
      } catch (error) {
        if (scope.accepts('graph', token))
          setGraph({
            data: null,
            error: normalizeApiError(
              error,
              'Não foi possível carregar a cadeia de rastreabilidade.'
            ),
            loading: false
          });
      }
    },
    [projectId, scope]
  );
  useEffect(() => {
    const heading = flowHeading.current;
    if (!graph.loading && heading && document.activeElement === heading) {
      heading.scrollIntoView?.({ block: 'start' });
    }
  }, [graph.loading]);
  function select(requirement) {
    setSelected(requirement);
    void loadGraph(requirement);
    flowHeading.current?.focus({ preventScroll: true });
    flowHeading.current?.scrollIntoView?.({ block: 'start' });
  }
  if (!catalog.loading && !catalog.data && catalog.error)
    return (
      <ContextualErrorPage
        type={classifyPageError(catalog.error)}
        description={catalog.error.message}
        requestId={getErrorRequestId(catalog.error)}
        retryAfterSeconds={catalog.error.retryAfterSeconds}
        onRetry={catalog.retry}
      />
    );
  return (
    <main className="page-container sprints-screen traceability-page">
      <div className="traceability-content" inert={history ? true : undefined}>
        <Link className="back-link" to={`/projects/${projectId}`}>
          Voltar para o projeto
        </Link>
        <header className="page-header sprints-screen__header">
          <div>
            <span className="eyebrow">Rastreabilidade</span>
            <h1>Rastreabilidade</h1>
            <p>
              Acompanhe a situação dos requisitos, suas evidências e conexões ao longo do
              desenvolvimento.
            </p>
          </div>
          <ProjectSectionNav projectId={projectId} activeSection="traceability" />
        </header>
        <RequirementSummary summary={catalog.data?.summary} />
        <RequirementFilters
          filters={catalog.filters}
          onChange={catalog.change}
          onClear={catalog.clear}
          count={catalog.data?.pagination.total}
          total={catalog.data?.summary.total}
        />
        <section className="sprint-grid-section" aria-label="Requisitos">
          <header className="sprint-grid-section__heading">
            <h2>Requisitos</h2>
          </header>
          <div className="sprint-grid requirement-grid" role="list">
            {catalog.data?.items.map((item) => (
              <div role="listitem" key={item.requirement.id}>
                <RequirementCard
                  item={item}
                  selected={selected?.id === item.requirement.id}
                  onSelect={select}
                  onHistory={(requirement, trigger) => {
                    returnFocusRef.current = trigger;
                    setHistory(requirement);
                  }}
                />
              </div>
            ))}
          </div>
          {catalog.loading && <LoadingState message="Carregando requisitos..." />}
          {catalog.error && (
            <ErrorState
              message={catalog.error.message}
              retryAfterSeconds={catalog.error.retryAfterSeconds}
              onRetry={catalog.retry}
            />
          )}
          {!catalog.loading && !catalog.error && catalog.data?.items.length === 0 && (
            <EmptyState
              title={
                Object.values(catalog.filters).some(Boolean)
                  ? 'Nenhum requisito corresponde aos filtros.'
                  : 'Nenhum requisito cadastrado para este projeto.'
              }
            />
          )}
          {catalog.data?.pagination.page < catalog.data?.pagination.totalPages &&
            !catalog.error && (
              <button
                type="button"
                className="button button-secondary requirement-load-more"
                disabled={catalog.loading}
                onClick={catalog.more}
              >
                Carregar mais requisitos
              </button>
            )}
        </section>
        <section
          className="card traceability-flow-section"
          aria-labelledby="requirement-flow-heading"
        >
          <h2 id="requirement-flow-heading" tabIndex={-1} ref={flowHeading}>
            Fluxo de rastreabilidade{selected ? ` — ${selected.displayId}` : ''}
          </h2>
          {!selected && (
            <EmptyState title="Selecione um requisito para visualizar sua cadeia rastreável." />
          )}
          {graph.loading && <LoadingState message="Carregando requisito selecionado..." />}
          {graph.error && (
            <ErrorState
              message={graph.error.message}
              retryAfterSeconds={graph.error.retryAfterSeconds}
              onRetry={() => loadGraph(selected)}
            />
          )}
          {graph.data && <TraceabilityFlow traceability={graph.data} />}
        </section>
      </div>
      <SprintDialog
        open={Boolean(history)}
        title={history ? `Histórico — ${history.displayId} · ${history.title}` : 'Histórico'}
        description="Evolução da situação de rastreabilidade."
        onClose={closeHistory}
        returnFocusRef={returnFocusRef}
        initialFocusSelector="[data-requirement-history]"
      >
        {history && (
          <RequirementHistory key={history.id} projectId={projectId} requirementId={history.id} />
        )}
      </SprintDialog>
    </main>
  );
}
