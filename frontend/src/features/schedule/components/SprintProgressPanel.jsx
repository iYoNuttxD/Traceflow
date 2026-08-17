import { formatDateTime } from './schedule-display.js';

// Evolucao da sprint (RF35). "Sem dados" e "zero" sao estados distintos: a API
// devolve percentage null quando nao ha tarefa para medir, e exibir 0% ali diria
// que nada foi concluido — o que e diferente de nao haver o que concluir.
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

export function SprintProgressPanel({ sprint, progress, loading = false, onClose }) {
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
  // Sprint encerrada devolve um registro, nao uma medida do momento: os rótulos
  // precisam falar no passado, senão a tela afirma "agora" sobre algo congelado.
  const congelada = progress.frozen === true;
  const { added, removed } = progress.scopeChange;
  const carryOver = progress.carryOver || [];

  return (
    <section className="sprint-progress-panel" aria-label={`Evolução da sprint ${sprint.name}`}>
      <h3>Evolução de {sprint.name}</h3>

      <p className="field-help">
        {aberta
          ? 'A sprint ainda não começou: o planejamento não está fechado, então o escopo planejado é o escopo atual.'
          : `Planejamento fechado em ${formatDateTime(progress.baseline.at)}, quando a sprint foi iniciada.`}
      </p>

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
          {/* Frase em um único nó de texto: quebrá-la em vários elementos faz o
              leitor de tela anunciar pedaços soltos. */}
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
