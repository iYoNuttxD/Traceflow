import { useCallback, useEffect, useState } from 'react';
import {
  EntityRow,
  ErrorState,
  LoadingState,
  normalizeApiError,
  TraceFlowIcon
} from '../../../shared/index.js';
import { testCasesApi, useTestCaseScope } from '../../testCases/index.js';
import { defectsApi, defectStatuses, defectSeverities } from '../../defects/index.js';
import { ArtifactCategory, TaskTraceabilityGrid } from './TaskDetailsLayout.jsx';

const empty = () => ({ items: [], total: null, page: 0, loading: true, error: null });
const resultLabels = { PASS: 'Aprovado', FAIL: 'Falhou', BLOCKED: 'Bloqueado' };
export function TaskQuality({ task, projectId, canCreate, onCreate, createRef, onNavigate }) {
  const scope = useTestCaseScope(`${projectId}:${task.id}`);
  const [streams, setStreams] = useState({ cases: empty(), origin: empty(), correction: empty() });
  const load = useCallback(
    async (kind, page = 1) => {
      const token = scope.begin(kind);
      setStreams((old) => ({ ...old, [kind]: { ...old[kind], loading: true, error: null } }));
      try {
        const params = {
          page,
          limit: 20,
          [kind === 'cases' ? 'taskId' : kind === 'origin' ? 'originTaskId' : 'correctionTaskId']:
            task.id
        };
        const data = await (kind === 'cases' ? testCasesApi : defectsApi).list(projectId, params, {
          signal: token.controller.signal
        });
        if (scope.accepts(kind, token))
          setStreams((old) => ({
            ...old,
            [kind]: {
              items: [
                ...new Map(
                  [...(page > 1 ? old[kind].items : []), ...data.items].map((item) => [
                    item.id,
                    item
                  ])
                ).values()
              ],
              total: data.total,
              page,
              loading: false,
              error: null
            }
          }));
      } catch (error) {
        if (scope.accepts(kind, token))
          setStreams((old) => ({
            ...old,
            [kind]: { ...old[kind], loading: false, error: normalizeApiError(error) }
          }));
      }
    },
    [projectId, task.id, scope]
  );
  useEffect(() => {
    setStreams({ cases: empty(), origin: empty(), correction: empty() });
    void load('cases');
    void load('origin');
    void load('correction');
  }, [load]);
  const stream = (kind) => {
    const data = streams[kind];
    if (!data.loading && !data.error && !data.items.length) return null;
    return (
      <div className="task-detail-relation-list">
        {data.loading && <LoadingState message="Carregando relações de qualidade…" />}
        {data.error && (
          <ErrorState
            message={data.error.message}
            onRetry={() => load(kind, data.page ? data.page + 1 : 1)}
          />
        )}
        {data.items.map((item) => (
          <EntityRow
            key={item.id}
            identity={item.displayId || `${kind === 'cases' ? 'TC' : 'DEF'}-${item.id}`}
            title={item.title}
            to={`/projects/${projectId}/${kind === 'cases' ? 'test-cases?case' : 'defects?defect'}=${item.id}`}
            onClick={onNavigate}
          >
            {kind === 'cases' ? (
              <span>
                {item.status === 'ATIVO' ? 'Ativo' : 'Inativo'} · Última execução:{' '}
                {resultLabels[item.latestExecution?.result] || 'Nunca executado'}
              </span>
            ) : (
              <span>
                <strong>{kind === 'origin' ? 'ORIGEM' : 'CORREÇÃO'}</strong> ·{' '}
                {defectSeverities[item.severity]} · {defectStatuses[item.status]}
              </span>
            )}
          </EntityRow>
        ))}
        {data.items.length < data.total && (
          <button
            className="button button-secondary button-compact"
            disabled={data.loading}
            onClick={() => load(kind, data.page + 1)}
          >
            Carregar mais{' '}
            {kind === 'cases'
              ? 'casos'
              : kind === 'origin'
                ? 'defeitos de origem'
                : 'defeitos de correção'}
          </button>
        )}
      </div>
    );
  };
  const ds = [streams.origin, streams.correction];
  return (
    <TaskTraceabilityGrid title="Qualidade">
      <ArtifactCategory
        label="Casos de teste"
        count={streams.cases.total}
        footer={
          canCreate && (
            <button
              ref={createRef}
              type="button"
              className="button button-outline button-compact"
              onClick={onCreate}
            >
              <TraceFlowIcon name="plus" />
              Criar caso de teste
            </button>
          )
        }
      >
        {stream('cases')}
        {!streams.cases.loading && !streams.cases.error && streams.cases.total === 0 && (
          <p>Nenhum caso de teste relacionado.</p>
        )}
      </ArtifactCategory>
      <ArtifactCategory
        label="Defeitos"
        count={ds.every((d) => d.total != null) ? ds.reduce((n, d) => n + d.total, 0) : null}
      >
        {stream('origin')}
        {stream('correction')}
        {ds.every((d) => !d.loading && !d.error && d.total === 0) && (
          <p>Nenhum defeito relacionado.</p>
        )}
      </ArtifactCategory>
    </TaskTraceabilityGrid>
  );
}
