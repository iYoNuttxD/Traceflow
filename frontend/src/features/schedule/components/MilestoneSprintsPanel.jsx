import {
  formatSprintCardPeriod,
  sprintStatusKey,
  sprintStatusKeyLabels,
  statusBadgeClass,
  getSprintDisplayMetrics
} from './schedule-display.js';
import { sprintEndsAfterMilestone, summarizeMilestoneSprints } from './milestone-view.js';

export function MilestoneSprintsPanel({ milestone, sprints, scheduleById = {}, onClose }) {
  const summary = summarizeMilestoneSprints(milestone.id, sprints, scheduleById);

  return (
    <div className="milestone-sprints-modal">
      <div className="milestone-sprints-modal__summary" aria-label="Resumo das Sprints do marco">
        <span>
          <strong>{summary.linked}</strong> {summary.linked === 1 ? 'Sprint' : 'Sprints'}
        </span>
        <span>
          <strong>{summary.done}</strong> concluída{summary.done === 1 ? '' : 's'}
        </span>
        <span>
          <strong>{summary.planned}</strong> planejada{summary.planned === 1 ? '' : 's'}
        </span>
        <span>
          <strong>{summary.active}</strong> em andamento
        </span>
        <span>
          <strong>{summary.points ?? '—'}</strong> pts
        </span>
      </div>

      <div className="milestone-sprints-modal__progress">
        <div>
          <span>Progresso pelas Sprints</span>
          <strong>{summary.total ? `${summary.percent}%` : 'Sem Sprints ativas'}</strong>
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
              : 'Sem Sprints vinculadas para calcular o progresso'
          }
        >
          <span style={{ width: `${summary.percent}%` }} />
        </div>
        {summary.cancelled > 0 && (
          <small>
            {summary.cancelled} Sprint{summary.cancelled === 1 ? '' : 's'} cancelada
            {summary.cancelled === 1 ? '' : 's'} fora do cálculo de progresso.
          </small>
        )}
      </div>

      {summary.linked === 0 ? (
        <div className="milestone-sprints-modal__empty" role="status">
          <strong>Nenhuma Sprint vinculada.</strong>
          <p>Edite o marco para pesquisar e associar Sprints abertas.</p>
        </div>
      ) : (
        <ul className="milestone-sprints-modal__list" aria-label={`Sprints de ${milestone.title}`}>
          {summary.sprints.map((sprint) => {
            const taskSummary = getSprintDisplayMetrics(sprint, scheduleById[sprint.id]);
            const statusKey = sprintStatusKey(sprint);
            return (
              <li key={sprint.id}>
                <div className="milestone-sprints-modal__item-heading">
                  <strong>{sprint.name}</strong>
                  <span className={statusBadgeClass(statusKey)}>
                    {sprintStatusKeyLabels[statusKey] || sprint.status}
                  </span>
                </div>
                <p>
                  {formatSprintCardPeriod(sprint)} · {taskSummary.points ?? '—'} pts
                </p>
                {taskSummary.unavailable && <small>Dados históricos indisponíveis.</small>}
                {sprintEndsAfterMilestone(sprint, milestone) && (
                  <small>Termina após o prazo do marco.</small>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="milestone-sprints-modal__actions">
        <button type="button" className="button button-secondary" onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  );
}
