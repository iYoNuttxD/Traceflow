import { SprintBurndownChart } from './SprintBurndownChart.jsx';
import { diffDaysIso, shortDate, sprintDayRange, todayIsoDay } from './schedule-calendar.js';
import {
  sprintStatusKey,
  sprintStatusKeyLabels,
  statusBadgeClass,
  summarizeSprintTasks,
  transitionHints
} from './schedule-display.js';

function prazoLabel(sprint, statusKey, hojeIso) {
  const { inicio, fim } = sprintDayRange(sprint);
  if (statusKey === 'PLANEJADA') return `Início em ${shortDate(inicio)}`;
  if (statusKey === 'EM_ANDAMENTO') {
    const dias = diffDaysIso(hojeIso, fim);
    return `Termina em ${shortDate(fim)} (${dias} ${dias === 1 ? 'dia' : 'dias'})`;
  }
  if (statusKey === 'ATRASADA') {
    const dias = diffDaysIso(fim, hojeIso);
    return `Venceu há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
  }
  if (statusKey === 'CANCELADA') return 'Sprint cancelada';
  return `Encerrada em ${shortDate(fim)}`;
}

function Metrica({ titulo, valor, children }) {
  return (
    <div className="sprint-progress-metric">
      <h4>{titulo}</h4>
      <p className="sprint-progress-value">{valor}</p>
      {children}
    </div>
  );
}

export function SprintBoardPanel({
  sprints,
  scheduleById = {},
  milestoneNames = {},
  selectedSprintId,
  progress,
  progressLoading = false,
  busy = false,
  readOnly = false,
  activeSprintName = '',
  hoje = new Date(),
  onSelectSprint,
  onChangeStatus
}) {
  const sprint = sprints.find((item) => item.id === selectedSprintId) || null;

  if (!sprints.length) {
    return (
      <section className="kanban-history">
        <div className="kanban-section-header">
          <div>
            <h2>Andamento das sprints</h2>
            <p>Cadastre uma sprint para acompanhar a evolução do quadro.</p>
          </div>
        </div>
      </section>
    );
  }

  const hojeIso = todayIsoDay(hoje);
  const statusKey = sprint ? sprintStatusKey(sprint, hoje) : null;
  const resumo = summarizeSprintTasks(scheduleById[sprint?.id]);
  const congelada = sprint ? sprint.status === 'CONCLUIDA' || sprint.status === 'CANCELADA' : false;
  const bloqueadaPorOutra =
    Boolean(activeSprintName) && sprint?.status === 'PLANEJADA' && activeSprintName !== sprint.name;
  const { inicio, fim } = sprint ? sprintDayRange(sprint) : { inicio: '', fim: '' };

  return (
    <section className="kanban-history" aria-label="Andamento das sprints">
      <div className="kanban-section-header">
        <div>
          <h2>Andamento das sprints</h2>
          <p>
            Selecione uma sprint para acompanhar a evolução. Sprints concluídas ficam congeladas —
            só é possível iniciar a próxima quando a atual terminar.
          </p>
        </div>
        <div className="schedule-form">
          <div className="form-field">
            <label htmlFor="kanban-sprint-andamento">Sprint</label>
            <select
              id="kanban-sprint-andamento"
              value={selectedSprintId ?? ''}
              onChange={(event) => onSelectSprint(Number(event.target.value))}
            >
              {sprints.map((item) => {
                const chave = sprintStatusKey(item, hoje);
                return (
                  <option key={item.id} value={item.id}>
                    {item.name} · {sprintStatusKeyLabels[chave] || item.status}
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      </div>

      {!sprint ? null : (
        <>
          <div className="sprint-item-header">
            <h3>{sprint.name}</h3>
            <span className={statusBadgeClass(statusKey)}>
              {sprintStatusKeyLabels[statusKey] || sprint.status}
            </span>
          </div>
          <p className="sprint-meta">
            <span>Marco: {milestoneNames[sprint.milestoneId] || 'Sem marco'}</span>
            <span>
              {shortDate(inicio)} – {shortDate(fim)}
            </span>
          </p>
          {sprint.objective && <p className="sprint-objective">{sprint.objective}</p>}

          <div className="sprint-progress-panel">
            <h3>Evolução da sprint</h3>
            <div className="sprint-progress-metrics">
              <Metrica titulo="Tarefas" valor={`${resumo.done} de ${resumo.total}`} />
              <Metrica titulo="Pontos" valor={`${resumo.donePoints} de ${resumo.points}`} />
              <Metrica
                titulo="Progresso"
                valor={resumo.percent === null ? 'Sem pontos' : `${resumo.percent}%`}
              >
                {resumo.percent !== null && (
                  <div className="traceability-progress-bar">
                    <span style={{ width: `${resumo.percent}%` }} />
                  </div>
                )}
              </Metrica>
              <Metrica titulo="Prazo" valor={prazoLabel(sprint, statusKey, hojeIso)} />
            </div>

            {progressLoading ? (
              <p className="empty-state" role="status">
                Calculando a evolução...
              </p>
            ) : (
              <SprintBurndownChart burndown={progress?.burndown} />
            )}
          </div>

          <div className="sprint-actions">
            {sprint.status === 'PLANEJADA' && !readOnly && (
              <button
                type="button"
                className="button button-primary"
                disabled={busy || bloqueadaPorOutra}
                title={
                  bloqueadaPorOutra
                    ? `Conclua a sprint "${activeSprintName}" para iniciar outra.`
                    : transitionHints.EM_ANDAMENTO
                }
                onClick={() => onChangeStatus(sprint, 'EM_ANDAMENTO')}
              >
                Iniciar sprint
              </button>
            )}
            {sprint.status === 'EM_ANDAMENTO' && !readOnly && (
              <button
                type="button"
                className="button button-primary"
                disabled={busy}
                title={transitionHints.CONCLUIDA}
                onClick={() => onChangeStatus(sprint, 'CONCLUIDA')}
              >
                Concluir sprint
              </button>
            )}
            {bloqueadaPorOutra && (
              <p className="field-help">
                Conclua a sprint &ldquo;{activeSprintName}&rdquo; para iniciar outra.
              </p>
            )}
            {congelada && (
              <p className="milestone-frozen">
                Sprint congelada — o quadro desta sprint é somente leitura.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
