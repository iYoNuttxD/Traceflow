import { diffDaysIso, shortDate, sprintDayRange, todayIsoDay } from './schedule-calendar.js';
import { formatDateTime, sprintStatusKey, getSprintDisplayMetrics } from './schedule-display.js';
import { SprintBurndownChart } from './SprintBurndownChart.jsx';

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

function Medida({ titulo, metrica, descricao }) {
  return (
    <div className="sprint-progress-metric">
      <h4>{titulo}</h4>
      {metrica.hasData ? (
        <>
          <p className="sprint-progress-value">{metrica.percentage}%</p>
          <p className="field-help">
            {metrica.numerator} de {metrica.denominator} concluídas
          </p>
        </>
      ) : (
        <p className="empty-state">Sem tarefas para medir.</p>
      )}
      <p className="field-help">{descricao}</p>
    </div>
  );
}

export function SprintProgressPanel({
  sprint,
  scheduleSprint,
  progress,
  loading = false,
  hoje = new Date(),
  onClose
}) {
  if (loading) {
    return (
      <section className="sprint-progress-panel" aria-label={`Evolução da sprint ${sprint.name}`}>
        <h3>Evolução de {sprint.name}</h3>
        <p className="empty-state" role="status">
          Calculando a evolução...
        </p>
      </section>
    );
  }
  if (!progress) return null;

  const aberta = progress.baseline.kind === 'OPEN';
  const congelada = progress.frozen === true;
  const { added, removed } = progress.scopeChange;
  const carryOver = progress.carryOver || [];
  const statusKey = sprintStatusKey(sprint, hoje);
  const resumo = getSprintDisplayMetrics(
    {
      ...sprint,
      status: progress.frozen ? (progress.status ?? sprint.status) : sprint.status,
      historicalSummary: progress.historicalSummary ?? sprint.historicalSummary
    },
    scheduleSprint
  );

  return (
    <section className="sprint-progress-panel" aria-label={`Evolução da sprint ${sprint.name}`}>
      <h3>Evolução de {sprint.name}</h3>

      <p className="field-help">
        {aberta
          ? 'A sprint ainda não começou: o planejamento não está fechado, então o escopo planejado é o escopo atual.'
          : `Planejamento fechado em ${formatDateTime(progress.baseline.at)}, quando a sprint foi iniciada.`}
      </p>

      {resumo.unavailable && <p className="field-help">Dados históricos indisponíveis.</p>}
      <div className="sprint-progress-metrics">
        <Metrica titulo="Tarefas" valor={`${resumo.done ?? '—'} de ${resumo.total ?? '—'}`} />
        <Metrica titulo="Pontos" valor={`${resumo.donePoints ?? '—'} de ${resumo.points ?? '—'}`} />
        <Metrica
          titulo="Progresso"
          valor={
            resumo.unavailable ? '—' : resumo.percent === null ? 'Sem pontos' : `${resumo.percent}%`
          }
        >
          {resumo.percent !== null && (
            <div className="traceability-progress-bar">
              <span style={{ width: `${resumo.percent}%` }} />
            </div>
          )}
        </Metrica>
        <Metrica titulo="Prazo" valor={prazoLabel(sprint, statusKey, todayIsoDay(hoje))} />
      </div>

      <div className="sprint-progress-metrics">
        <Medida
          titulo="Escopo planejado"
          metrica={progress.planned}
          descricao="Tarefas que estavam na sprint quando o planejamento fechou."
        />
        <Medida
          titulo={congelada ? 'Escopo no encerramento' : 'Escopo atual'}
          metrica={progress.current}
          descricao={
            congelada
              ? 'Tarefas que estavam na sprint quando ela foi encerrada.'
              : 'Tarefas que estão na sprint agora.'
          }
        />
      </div>

      <SprintBurndownChart burndown={progress.burndown} />

      {carryOver.length > 0 && (
        <div className="sprint-progress-scope">
          <h4>Continuaram em outra sprint</h4>
          <p>
            {`${carryOver.length} ${carryOver.length === 1 ? 'tarefa seguiu' : 'tarefas seguiram'} para a sprint seguinte: ${carryOver
              .map((item) => `#${item.taskId}`)
              .join(', ')}. O status registrado aqui não muda com o que acontecer lá.`}
          </p>
        </div>
      )}

      {!aberta && (added.length > 0 || removed.length > 0) && (
        <div className="sprint-progress-scope">
          <h4>Mudanças depois do planejamento</h4>
          {added.length > 0 && (
            <p>
              {`${added.length} ${added.length === 1 ? 'tarefa entrou' : 'tarefas entraram'} na sprint: ${added
                .map((item) => `#${item.taskId}`)
                .join(', ')}`}
            </p>
          )}
          {removed.length > 0 && (
            <p>
              {`${removed.length} ${removed.length === 1 ? 'tarefa saiu' : 'tarefas saíram'} da sprint: ${removed
                .map((item) => `#${item.taskId}`)
                .join(', ')}`}
            </p>
          )}
        </div>
      )}

      {!aberta && added.length === 0 && removed.length === 0 && (
        <p className="field-help">Nenhuma tarefa entrou ou saiu depois do planejamento.</p>
      )}

      <p className="field-help">
        {congelada
          ? `Resultado congelado no encerramento, em ${formatDateTime(progress.cutoff)}.`
          : `Apurado em ${formatDateTime(progress.cutoff)}.`}{' '}
        O percentual considera tarefas com status concluído; tarefas removidas continuam no escopo
        planejado.
      </p>

      <div className="form-actions">
        <button type="button" className="button button-secondary" onClick={onClose}>
          Fechar
        </button>
      </div>
    </section>
  );
}
