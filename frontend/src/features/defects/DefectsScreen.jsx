import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { ProjectSectionNav, useProjectsCatalog } from '../projects/index.js';
import { CollapsibleFilterPanel, SprintActionsMenu } from '../schedule/index.js';
import {
  ContextualErrorPage,
  LoadingState,
  ErrorState,
  PAGE_ERROR_TYPES,
  SearchCombobox,
  TraceFlowIcon
} from '../../shared/index.js';
import { useDefects, useDefectOptions } from './hooks/useDefects.js';
import { DefectFlow } from './components/DefectFlow.jsx';
import { DefectBadge } from './components/DefectDetails.jsx';
import {
  statuses,
  severities,
  contextualAction,
  requirementLabel,
  taskLabel,
  executionLabel
} from './model/defects.js';
import './defects.css';
export function DefectCard({ defect: d, canWrite, onOpen }) {
  const open = (view, e) => {
    e.stopPropagation();
    onOpen(view, d, e.currentTarget);
  };
  return (
    <article
      className="sprint-card tc-card defect-card"
      role="button"
      tabIndex={0}
      aria-label={`Abrir ${d.displayId} · ${d.title}`}
      onClick={(e) => onOpen('details', d, e.currentTarget)}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && ['Enter', ' '].includes(e.key)) {
          e.preventDefault();
          onOpen('details', d, e.currentTarget);
        }
      }}
    >
      <header className="tc-card-heading">
        <small>{d.displayId}</small>
        <DefectBadge value={d.severity} />
      </header>
      <div className="tc-card-body">
        <h3 title={d.title}>{d.title}</h3>
        <div className="tc-card-responsible">
          <span className="tc-avatar" aria-hidden="true">
            {d.responsibleUser.name.slice(0, 1)}
          </span>
          <span>{d.responsibleUser.name}</span>
        </div>
        <DefectBadge value={d.status} />
        <div className="defect-card-context">
          <small>Detectado em</small>
          {d.detectionSummary && (
            <span>
              TC-{d.detectionSummary.testCaseId} · {executionLabel(d.detectionSummary.executionId)}{' '}
              · Passo {d.detectionSummary.stepPosition}
            </span>
          )}
          <small>Correção</small>
          <span>
            {d.correctionTaskCount ?? '—'} {d.correctionTaskCount === 1 ? 'tarefa' : 'tarefas'} de
            correção · Ciclo {d.currentCorrectionCycle}
          </span>
        </div>
      </div>
      <footer
        className="sprint-card__actions"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {canWrite && contextualAction(d.status) && (
          <button
            className="button button-primary"
            onClick={(e) => open(d.status === 'AGUARDANDO_RETESTE' ? 'retest' : 'correction', e)}
          >
            {contextualAction(d.status)}
          </button>
        )}
        <button className="button button-secondary" onClick={(e) => open('history', e)}>
          Histórico
        </button>
        {canWrite && (
          <SprintActionsMenu
            entityName={d.displayId}
            entityDescriptor="do defeito"
            items={[
              { key: 'edit', label: 'Editar', onSelect: (trigger) => onOpen('edit', d, trigger) },
              {
                key: 'delete',
                label: 'Excluir defeito',
                danger: true,
                onSelect: (trigger) => onOpen('delete', d, trigger)
              }
            ]}
          />
        )}
      </footer>
    </article>
  );
}
function ProjectDefects({ project }) {
  const state = useDefects(project.id),
    options = useDefectOptions(project.id),
    [dialog, setDialog] = useState(null),
    [selected, setSelected] = useState({}),
    [feedback, setFeedback] = useState('');
  const returnFocusRef = useRef(null),
    [params, setParams] = useSearchParams(),
    opened = useRef(null);
  const canWrite = Boolean(options.membership && options.membership.role !== 'VIEWER');
  const requested = params.get('defect');
  useEffect(() => {
    if (requested && /^\d+$/.test(requested) && opened.current !== requested) {
      opened.current = requested;
      setDialog({ id: Number(requested), view: 'details' });
    }
  }, [requested]);
  const open = (view, d, trigger) => {
    returnFocusRef.current = trigger || document.activeElement;
    setDialog({ id: d?.id, view });
  };
  const close = () => {
    setDialog(null);
    if (requested) {
      const next = new URLSearchParams(params);
      next.delete('defect');
      setParams(next, { replace: true });
    }
  };
  const metrics = [
    ['Total', 'total'],
    ['Abertos', 'ABERTO'],
    ['Em correção', 'EM_CORRECAO'],
    ['Aguardando reteste', 'AGUARDANDO_RETESTE'],
    ['Validados', 'VALIDADO']
  ];
  if ([403, 404].includes(state.error?.status) || [403, 404].includes(options.error?.status))
    return <ContextualErrorPage error={state.error || options.error} showRetry={false} />;
  const clear = () => {
    setSelected({});
    state.clear();
  };
  return (
    <div className="page-container sprints-screen tc-screen defects-screen">
      <div inert={dialog ? true : undefined}>
        <header className="page-header sprints-screen__header">
          <div>
            <span className="eyebrow">Defeitos</span>
            <h1>Defeitos</h1>
            <p>
              Registre falhas comprovadas em execuções de teste, acompanhe as correções e valide os
              resultados por reteste.
            </p>
          </div>
          <ProjectSectionNav projectId={project.id} activeSection="defects" />
        </header>
        {feedback && (
          <p role="status" className="tc-feedback">
            {feedback}
          </p>
        )}
        {state.warning && (
          <p role="status" className="tc-notice">
            {state.warning}
            <button className="button button-secondary" onClick={() => state.load(1, true)}>
              Atualizar lista
            </button>
          </p>
        )}
        {options.error && <ErrorState message={options.error.message} onRetry={options.load} />}
        <section className="sprints-summary" aria-label="Resumo dos defeitos">
          <div className="sprints-summary__heading">
            <div>
              <span className="eyebrow">Resumo</span>
              <h2>Visão geral dos defeitos</h2>
            </div>
          </div>
          <dl className="tc-metrics">
            {metrics.map(([label, key]) => (
              <div className="sprints-summary__metric" key={key}>
                <dt>{label}</dt>
                <dd>{state.catalog.summary?.[key] ?? '—'}</dd>
              </div>
            ))}
          </dl>
        </section>
        <CollapsibleFilterPanel
          className="sprint-filters"
          activeCount={Object.values(state.filters).filter(Boolean).length}
          resultLabel={`${state.catalog.total} defeitos`}
        >
          <div className="tc-filter-grid">
            <label className="sprint-filter">
              <span>Pesquisar</span>
              <input
                id="defects-filter-search"
                name="search"
                value={state.filters.search}
                maxLength={200}
                placeholder="DEF-id ou título"
                onChange={(e) => state.changeFilter('search', e.target.value)}
              />
            </label>
            {[
              ['status', 'Status', statuses],
              ['severity', 'Severidade', severities]
            ].map(([key, label, values]) => (
              <label className="sprint-filter" key={key}>
                <span>{label}</span>
                <select
                  id={`defects-filter-${key}`}
                  name={key}
                  value={state.filters[key]}
                  onChange={(e) => state.changeFilter(key, e.target.value)}
                >
                  <option value="">Todos</option>
                  {Object.entries(values).map(([v, name]) => (
                    <option key={v} value={v}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            {[
              [
                'responsibleUserId',
                'Responsável',
                null,
                (m) => m.name,
                options.members
                  .filter((m) => m.isActive)
                  .map((m) => ({ id: m.user.id, name: m.user.name }))
              ],
              ['requirementId', 'Requisito', options.searchRequirements, requirementLabel],
              ['originTaskId', 'Tarefa de origem', options.searchTasks, taskLabel],
              ['correctionTaskId', 'Tarefa de correção', options.searchTasks, taskLabel],
              [
                'testCaseId',
                'Caso de teste',
                options.searchCases,
                (t) => `${t.displayId} · ${t.title}`
              ]
            ].map(([key, label, search, labeler, items]) => (
              <SearchCombobox
                key={key}
                label={label}
                onSearch={search}
                options={items}
                minQueryLength={search ? 2 : 0}
                openOnFocus={false}
                getOptionLabel={labeler}
                selectedOption={selected[key] || null}
                onSelect={(item) => {
                  setSelected((old) => ({ ...old, [key]: item }));
                  state.changeFilter(key, item.id);
                }}
                onClear={() => {
                  setSelected((old) => ({ ...old, [key]: null }));
                  state.changeFilter(key, '');
                }}
              />
            ))}
          </div>
          <button className="sprint-filters__clear" onClick={clear}>
            Limpar filtros
          </button>
        </CollapsibleFilterPanel>
        {state.loading && <LoadingState message="Carregando defeitos…" />}
        {state.error && (
          <ErrorState
            message={state.error.message}
            onRetry={() => state.load(state.catalog.page ? state.catalog.page + 1 : 1)}
          />
        )}
        <section className="sprint-grid-section tc-catalog">
          <header className="sprint-grid-section__heading">
            <h2>Defeitos do projeto</h2>
          </header>
          <div className="sprint-grid tc-grid" role="list" aria-label="Defeitos do projeto">
            {canWrite && (
              <div role="listitem">
                <button
                  className="new-milestone-card tc-new-card"
                  onClick={(e) => open('create', null, e.currentTarget)}
                >
                  <span className="new-milestone-card__icon">
                    <TraceFlowIcon name="plus" />
                  </span>
                  <strong>Registrar defeito</strong>
                  <small>Registre uma falha comprovada em teste.</small>
                </button>
              </div>
            )}
            {state.catalog.items.map((d) => (
              <div role="listitem" key={d.id}>
                <DefectCard defect={d} canWrite={canWrite} onOpen={open} />
              </div>
            ))}
          </div>
        </section>
        {!state.loading && !state.error && !state.catalog.items.length && (
          <section className="tc-surface">
            <p role="status">
              {Object.values(state.filters).some(Boolean)
                ? 'Nenhum defeito corresponde aos filtros.'
                : 'Nenhum defeito registrado neste projeto.'}
            </p>
            <p>
              Defeitos são registrados a partir de passos com falha em execuções de casos de teste.
            </p>
          </section>
        )}
        {state.catalog.items.length < state.catalog.total && (
          <button
            className="button button-secondary"
            disabled={state.loading}
            onClick={() => state.load(state.catalog.page + 1)}
          >
            Carregar mais defeitos
          </button>
        )}
      </div>
      {dialog && (
        <DefectFlow
          key={`${project.id}:${dialog.id || 'new'}`}
          projectId={project.id}
          initialId={dialog.id}
          initialView={dialog.view}
          options={options}
          canWrite={canWrite}
          returnFocusRef={returnFocusRef}
          onClose={close}
          onConfirmed={(kind, saved, id) => {
            state.confirmed(kind, saved, id);
            if (kind === 'delete') setFeedback('Defeito excluído. Histórico preservado.');
          }}
        />
      )}
    </div>
  );
}
export function DefectsScreen() {
  const { projectId } = useParams(),
    { projects, loading, error, refreshProjects } = useProjectsCatalog();
  if (loading) return <LoadingState message="Carregando contexto do projeto…" />;
  if (error) return <ContextualErrorPage error={error} onRetry={refreshProjects} />;
  const project = projects.find((p) => String(p.id) === projectId);
  if (!project) return <ContextualErrorPage type={PAGE_ERROR_TYPES.NOT_FOUND} showRetry={false} />;
  return <ProjectDefects key={projectId} project={project} />;
}
