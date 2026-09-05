import { TraceFlowIcon } from '../../../shared/index.js';
import { SprintActionsMenu } from './SprintActionsMenu.jsx';
import {
  formatDuration,
  formatSprintCardPeriod,
  isTerminalSprint,
  sprintStatusKey,
  sprintStatusKeyLabels,
  statusBadgeClass,
  getSprintDisplayMetrics,
  transitionHints
} from './schedule-display.js';

function SprintCard({
  sprint,
  scheduleSprint,
  milestoneName,
  busy,
  activeSprintName,
  readOnly,
  onTasks,
  onProgress,
  onEdit,
  onChangeStatus,
  onViewInKanban
}) {
  const terminal = isTerminalSprint(sprint.status);
  const statusKey = sprintStatusKey(sprint);
  const summary = getSprintDisplayMetrics(sprint, scheduleSprint);
  const blockedByActive = Boolean(activeSprintName) && sprint.status === 'PLANEJADA';
  const menuItems = [
    {
      key: 'kanban',
      label: 'Ver no Kanban',
      ariaLabel: `Ver a sprint ${sprint.name} no Kanban`,
      onSelect: (trigger) => onViewInKanban(sprint, trigger)
    }
  ];

  if (!terminal && !readOnly) {
    menuItems.unshift({
      key: 'editar',
      label: 'Editar',
      ariaLabel: `Editar a sprint ${sprint.name}`,
      onSelect: (trigger) => onEdit(sprint, trigger)
    });
    if (sprint.status === 'PLANEJADA') {
      menuItems.push({
        key: 'iniciar',
        label: 'Iniciar',
        ariaLabel: `Iniciar a sprint ${sprint.name}`,
        disabled: busy || blockedByActive,
        title: blockedByActive
          ? `Conclua a sprint "${activeSprintName}" para iniciar outra.`
          : transitionHints.EM_ANDAMENTO,
        onSelect: () => onChangeStatus(sprint, 'EM_ANDAMENTO')
      });
    }
    if (sprint.status === 'EM_ANDAMENTO') {
      menuItems.push({
        key: 'concluir',
        label: 'Concluir',
        ariaLabel: `Concluir a sprint ${sprint.name}`,
        disabled: busy,
        title: transitionHints.CONCLUIDA,
        onSelect: () => onChangeStatus(sprint, 'CONCLUIDA')
      });
    }
    menuItems.push({
      key: 'cancelar',
      label: 'Cancelar sprint',
      ariaLabel: `Cancelar a sprint ${sprint.name}`,
      danger: true,
      disabled: busy,
      title: transitionHints.CANCELADA,
      onSelect: () => onChangeStatus(sprint, 'CANCELADA')
    });
  }

  return (
    <article className={`sprint-card sprint-card--${sprint.status.toLocaleLowerCase('pt-BR')}`}>
      <div className="sprint-card__header">
        <h3>{sprint.name}</h3>
        <span className={statusBadgeClass(statusKey)}>
          <span className="status-badge__dot" aria-hidden="true" />
          {sprintStatusKeyLabels[statusKey] || sprint.status}
        </span>
      </div>

      <div className="sprint-card__body">
        {sprint.objective ? (
          <p className="sprint-card__objective">{sprint.objective}</p>
        ) : (
          <p className="sprint-card__objective sprint-card__objective--empty">
            Sem objetivo informado.
          </p>
        )}

        <dl className="sprint-card__details">
          <div>
            <dt>Período</dt>
            <dd>
              {formatSprintCardPeriod(sprint)}
              {scheduleSprint?.durationInDays
                ? ` · ${formatDuration(scheduleSprint.durationInDays)}`
                : ''}
            </dd>
          </div>
          <div>
            <dt>Marco</dt>
            <dd>{milestoneName || 'Sem marco'}</dd>
          </div>
        </dl>

        <div className="sprint-card__task-summary">
          <span>
            <strong>{summary.total ?? '—'}</strong> {summary.total === 1 ? 'tarefa' : 'tarefas'}
          </span>
          <span>
            <strong>{summary.done ?? '—'}</strong> {summary.done === 1 ? 'concluída' : 'concluídas'}
          </span>
          <span>
            <strong>{summary.points ?? '—'}</strong> pts
          </span>
        </div>

        <div className="sprint-card__progress">
          <div>
            <span>Progresso por pontos</span>
            <strong>
              {summary.unavailable
                ? '—'
                : summary.percent === null
                  ? 'Sem estimativa'
                  : `${summary.percent}%`}
            </strong>
          </div>
          <div
            className="sprint-card__progress-track"
            role="progressbar"
            aria-label={`Progresso da sprint ${sprint.name}`}
            aria-valuemin={summary.percent === null ? undefined : 0}
            aria-valuemax={summary.percent === null ? undefined : 100}
            aria-valuenow={summary.percent ?? undefined}
            aria-valuetext={
              summary.unavailable
                ? 'Dados históricos indisponíveis'
                : summary.percent === null
                  ? 'Sem pontos estimados'
                  : `${summary.donePoints} de ${summary.points ?? '—'} pontos concluídos`
            }
          >
            <span style={{ width: `${summary.percent || 0}%` }} />
          </div>
        </div>

        {summary.unavailable && <p className="field-help">Dados históricos indisponíveis.</p>}
        {terminal && (
          <p className="sprint-card__frozen">
            <TraceFlowIcon name="lock" />
            {sprint.status === 'CANCELADA'
              ? 'Sprint cancelada e congelada.'
              : 'Registro congelado.'}
          </p>
        )}
      </div>

      <div
        className="sprint-card__actions"
        role="group"
        aria-label={`Ações da sprint ${sprint.name}`}
      >
        <button
          type="button"
          className="button button-secondary"
          onClick={(event) => onTasks(sprint, event.currentTarget)}
        >
          Tarefas
        </button>
        <button
          type="button"
          className="button button-secondary"
          onClick={(event) => onProgress(sprint, event.currentTarget)}
        >
          Evolução
        </button>
        <SprintActionsMenu sprintName={sprint.name} disabled={busy} items={menuItems} />
      </div>
    </article>
  );
}

export function SprintList({
  sprints,
  scheduleById = {},
  milestoneNames = {},
  busySprintId,
  activeSprintName = '',
  readOnly = false,
  filtered = false,
  onCreate,
  onTasks,
  onProgress,
  onEdit,
  onChangeStatus,
  onViewInKanban,
  listRef
}) {
  return (
    <section
      className="sprint-grid-section"
      aria-labelledby="sprint-grid-title"
      ref={listRef}
      tabIndex={-1}
    >
      <div className="sprint-grid-section__heading">
        <div>
          <h2 id="sprint-grid-title">Sprints do projeto</h2>
          <p>Abra tarefas e evolução sem perder o contexto do planejamento.</p>
        </div>
      </div>

      <div className="sprint-grid" role="list" aria-label="Sprints do projeto">
        {!readOnly && (
          <div role="listitem">
            <button
              type="button"
              className="new-sprint-card"
              aria-label="Nova sprint"
              onClick={(event) => onCreate(event.currentTarget)}
            >
              <span className="new-sprint-card__icon">
                <TraceFlowIcon name="plus" />
              </span>
              <strong>Nova sprint</strong>
              <small>Planeje um novo período de trabalho.</small>
            </button>
          </div>
        )}

        {sprints.map((sprint) => (
          <div role="listitem" key={sprint.id}>
            <SprintCard
              sprint={sprint}
              scheduleSprint={scheduleById[sprint.id]}
              milestoneName={milestoneNames[sprint.milestoneId]}
              busy={busySprintId === sprint.id}
              activeSprintName={activeSprintName}
              readOnly={readOnly}
              onTasks={onTasks}
              onProgress={onProgress}
              onEdit={onEdit}
              onChangeStatus={onChangeStatus}
              onViewInKanban={onViewInKanban}
            />
          </div>
        ))}
      </div>

      {sprints.length === 0 && filtered && (
        <div className="sprint-filter-empty" role="status">
          <strong>Nenhuma sprint corresponde aos filtros.</strong>
          <p>Limpe ou ajuste os filtros para voltar a exibir o planejamento.</p>
        </div>
      )}
      {sprints.length === 0 && !filtered && readOnly && (
        <div className="sprint-filter-empty" role="status">
          <strong>Nenhuma sprint disponível.</strong>
          <p>Seu perfil possui acesso somente para consulta.</p>
        </div>
      )}
    </section>
  );
}
