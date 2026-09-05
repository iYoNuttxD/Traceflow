import { TraceFlowIcon } from '../../../shared/index.js';
import { SprintActionsMenu } from './SprintActionsMenu.jsx';
import { formatInstant, formatSprintCardPeriod, statusBadgeClass } from './schedule-display.js';
import {
  milestoneCoveredPeriod,
  milestoneDeadlineHealth,
  milestoneDeadlineHealthLabels,
  summarizeMilestoneSprints
} from './milestone-view.js';

function MilestoneCard({
  milestone,
  sprints,
  scheduleById,
  busy,
  readOnly,
  onSprints,
  onEdit,
  onDelete,
  onReopen
}) {
  const summary = summarizeMilestoneSprints(milestone.id, sprints, scheduleById);
  const coveredPeriod = milestoneCoveredPeriod(milestone.id, sprints);
  const deadlineHealth = milestoneDeadlineHealth(milestone);
  const menuItems = [];

  if (!readOnly) {
    menuItems.push({
      key: 'editar',
      label: 'Editar',
      ariaLabel: `Editar o marco ${milestone.title}`,
      disabled: busy,
      onSelect: (trigger) => onEdit(milestone, trigger)
    });
    if (milestone.status === 'CONCLUIDO') {
      menuItems.push({
        key: 'reabrir',
        label: 'Reabrir',
        ariaLabel: `Reabrir o marco ${milestone.title}`,
        disabled: busy,
        title: 'Volta o marco para pendente. A conclusão automática poderá ocorrer novamente.',
        onSelect: () => onReopen(milestone)
      });
    }
    menuItems.push({
      key: 'excluir',
      label: 'Excluir marco',
      ariaLabel: `Excluir o marco ${milestone.title}`,
      danger: true,
      disabled: busy,
      title: 'Remove das visões atuais, preservando Sprints e histórico.',
      onSelect: (trigger) => onDelete(milestone, trigger)
    });
  }

  return (
    <article
      className={`milestone-card milestone-card--${deadlineHealth.toLocaleLowerCase('pt-BR')}`}
    >
      <div className="milestone-card__header">
        <h3>{milestone.title}</h3>
        <span className={statusBadgeClass(deadlineHealth)}>
          <span className="status-badge__dot" aria-hidden="true" />
          {milestoneDeadlineHealthLabels[deadlineHealth]}
        </span>
      </div>

      <div className="milestone-card__body">
        {milestone.description ? (
          <p className="milestone-card__description">{milestone.description}</p>
        ) : (
          <p className="milestone-card__description milestone-card__description--empty">
            Sem descrição informada.
          </p>
        )}

        <dl className="milestone-card__details">
          <div>
            <dt>Prazo</dt>
            <dd>{formatInstant(milestone.dueDate)}</dd>
          </div>
          <div>
            <dt>Período coberto</dt>
            <dd>
              {coveredPeriod
                ? formatSprintCardPeriod({
                    startDate: coveredPeriod.startDate,
                    endDate: coveredPeriod.endDate
                  })
                : '—'}
            </dd>
          </div>
        </dl>

        <div className="milestone-card__sprint-summary">
          {summary.linked ? (
            <>
              <span>
                <strong>{summary.done}</strong> de <strong>{summary.total}</strong>{' '}
                {summary.total === 1 ? 'Sprint concluída' : 'Sprints concluídas'}
              </span>
              <span>
                <strong>{summary.linked}</strong> vinculada{summary.linked === 1 ? '' : 's'}
              </span>
            </>
          ) : (
            <span>Sem Sprints vinculadas</span>
          )}
        </div>

        <div className="milestone-card__progress">
          <div>
            <span>Progresso pelas Sprints</span>
            <strong>
              {summary.total ? `${summary.percent}%` : summary.linked ? 'Sem base ativa' : 'Neutro'}
            </strong>
          </div>
          <div
            className="milestone-progress-track"
            role="progressbar"
            aria-label={`Progresso do marco ${milestone.title}`}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={summary.percent}
            aria-valuetext={
              summary.total
                ? `${summary.done} de ${summary.total} Sprints concluídas`
                : summary.linked
                  ? 'Somente Sprints canceladas, fora do cálculo de progresso'
                  : 'Sem Sprints vinculadas para calcular o progresso'
            }
          >
            <span style={{ width: `${summary.percent}%` }} />
          </div>
        </div>

        {milestone.status === 'CONCLUIDO' && summary.allConcluded && (
          <p className="milestone-card__automatic">
            <TraceFlowIcon name="check" />
            Conclusão automática baseada nas Sprints.
          </p>
        )}
      </div>

      <div
        className="milestone-card__actions"
        role="group"
        aria-label={`Ações do marco ${milestone.title}`}
      >
        <button
          type="button"
          className="button button-secondary"
          onClick={(event) => onSprints(milestone, event.currentTarget)}
        >
          Sprints
        </button>
        {menuItems.length > 0 && (
          <SprintActionsMenu
            entityName={milestone.title}
            entityDescriptor="do marco"
            disabled={busy}
            items={menuItems}
          />
        )}
      </div>
    </article>
  );
}

export function MilestoneList({
  milestones,
  sprints = [],
  scheduleById = {},
  busyMilestoneId,
  readOnly = false,
  filtered = false,
  onCreate,
  onSprints,
  onEdit,
  onDelete,
  onReopen,
  listRef
}) {
  return (
    <section
      className="milestone-grid-section"
      aria-labelledby="milestone-grid-title"
      ref={listRef}
      tabIndex={-1}
    >
      <div className="milestone-grid-section__heading">
        <div>
          <h2 id="milestone-grid-title">Marcos do projeto</h2>
          <p>Acompanhe entregas e consulte as Sprints agrupadas em cada objetivo.</p>
        </div>
      </div>

      <div className="milestone-grid" role="list" aria-label="Marcos do projeto">
        {!readOnly && (
          <div role="listitem">
            <button
              type="button"
              className="new-milestone-card"
              aria-label="Novo marco"
              onClick={(event) => onCreate(event.currentTarget)}
            >
              <span className="new-milestone-card__icon">
                <TraceFlowIcon name="plus" />
              </span>
              <strong>Novo marco</strong>
              <small>Defina um novo objetivo de entrega.</small>
            </button>
          </div>
        )}

        {milestones.map((milestone) => (
          <div role="listitem" key={milestone.id}>
            <MilestoneCard
              milestone={milestone}
              sprints={sprints}
              scheduleById={scheduleById}
              busy={busyMilestoneId === milestone.id}
              readOnly={readOnly}
              onSprints={onSprints}
              onEdit={onEdit}
              onDelete={onDelete}
              onReopen={onReopen}
            />
          </div>
        ))}
      </div>

      {milestones.length === 0 && filtered && (
        <div className="milestone-filter-empty" role="status">
          <strong>Nenhum marco corresponde aos filtros.</strong>
          <p>Limpe ou ajuste os filtros para voltar a exibir as entregas.</p>
        </div>
      )}
      {milestones.length === 0 && !filtered && readOnly && (
        <div className="milestone-filter-empty" role="status">
          <strong>Nenhum marco disponível.</strong>
          <p>Seu perfil possui acesso somente para consulta.</p>
        </div>
      )}
    </section>
  );
}
