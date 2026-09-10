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
  ResponsibleCombobox,
  SelectControl,
  TraceFlowIcon
} from '../../shared/index.js';
import { useDefects, useDefectOptions } from './hooks/useDefects.js';
import { DefectFlow } from './components/DefectFlow.jsx';
import { DefectBadge } from './components/DefectDetails.jsx';
import {
  statuses,
  severities,
  requirementLabel,
  taskLabel,
  executionLabel,
  taskStatuses
} from './model/defects.js';
import './defects.css';
export function DefectCard({ defect: d, canWrite, onOpen }) {
  const correctionCount = d.correctionSummary?.total ?? d.correctionTaskCount;
  const correctionLabel =
    correctionCount === 0 && canWrite && d.status !== 'VALIDADO'
      ? 'Adicionar correção'
      : 'Acessar correções';
  const canRetest = canWrite && d.status === 'AGUARDANDO_RETESTE';
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
            {correctionCount ?? '—'} {correctionCount === 1 ? 'tarefa' : 'tarefas'} · Ciclo{' '}
            {d.currentCorrectionCycle}
          </span>
          {d.correctionSummary?.singleTask && (
            <span>
              TASK-{d.correctionSummary.singleTask.id} ·{' '}
              {taskStatuses[d.correctionSummary.singleTask.status]}
            </span>
          )}
          {d.correctionSummary?.total > 1 && (
            <span>
              {d.correctionSummary.done}{' '}
              {d.correctionSummary.done === 1 ? 'concluída' : 'concluídas'} ·{' '}
              {d.correctionSummary.inProgress} em andamento · {d.correctionSummary.todo} a fazer
            </span>
          )}
          {d.requirement && (
            <div className="defect-card-requirement">
              <small>Requisito</small>
              <span title={requirementLabel(d.requirement)}>{requirementLabel(d.requirement)}</span>
            </div>
          )}
        </div>
      </div>
      <footer
        className={`sprint-card__actions defect-card-actions${canRetest ? ' defect-card-actions--retest' : ''}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <button
          className={`button ${correctionCount === 0 && canWrite ? 'button-primary' : 'button-secondary'} defect-card-correction-action`}
          onClick={(e) => open('correction', e)}
        >
          {correctionLabel}
        </button>
        {canRetest && (
          <button className="button button-primary" onClick={(e) => open('retest', e)}>
            Retestar
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
  const requestedSection = params.get('section') === 'correction' ? 'correction' : null;
  useEffect(() => {
    const key = `${requested}:${requestedSection || ''}`;
    if (requested && /^\d+$/.test(requested) && opened.current !== key) {
      opened.current = key;
      setDialog({
        id: Number(requested),
        view: 'details',
        section: requestedSection
      });
    }
  }, [requested, requestedSection]);
  const open = (view, d, trigger) => {
    returnFocusRef.current = trigger || document.activeElement;
    if (view === 'correction') {
      const next = new URLSearchParams(params);
      next.set('defect', String(d.id));
      next.set('section', 'correction');
      opened.current = `${d.id}:correction`;
      setParams(next);
    }
    setDialog({
      id: d?.id,
      view: view === 'correction' ? 'details' : view,
      section: view === 'correction' ? 'correction' : null
    });
  };
  const close = () => {
    setDialog(null);
    if (requested) {
      const next = new URLSearchParams(params);
      next.delete('defect');
      next.delete('section');
      opened.current = null;
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
                <SelectControl
                  id={`defects-filter-${key}`}
                  aria-label={label}
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
                </SelectControl>
              </label>
            ))}
            <ResponsibleCombobox
              members={options.members.filter((m) => m.isActive)}
              value={state.filters.responsibleUserId}
              onChange={(value) => state.changeFilter('responsibleUserId', value)}
            />
            {[
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
                placeholder={`Pesquisar ${label.toLocaleLowerCase('pt-BR')}...`}
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
          {Object.values(state.filters).some(Boolean) && (
            <div className="planning-filter-panel__actions">
              <button className="sprint-filters__clear" onClick={clear}>
                Limpar filtros
              </button>
            </div>
          )}
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
          initialSection={dialog.section}
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
