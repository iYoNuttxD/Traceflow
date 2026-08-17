import { useEffect, useState } from 'react';
import { isTerminalSprint, taskPriorityLabels, taskStatusLabels } from './schedule-display.js';

// Associa e desassocia tarefas da sprint selecionada.
// A substituicao e atomica no backend: falha em qualquer item nao persiste nada.
export function SprintTasksPanel({
  sprint,
  tasks,
  sprintTasks = [],
  selectedTaskIds,
  sprintNames = {},
  loading = false,
  submitting,
  readOnly = false,
  onSubmit,
  onCancel
}) {
  const [selection, setSelection] = useState(selectedTaskIds);

  useEffect(() => {
    setSelection(selectedTaskIds);
  }, [selectedTaskIds]);

  // A lista traz TODAS as tarefas do projeto, inclusive as ja alocadas em outra
  // sprint. Marcar uma delas nao a copia: move, e a sprint de origem perde a
  // tarefa do escopo. Sem dizer isso, o usuario esvazia o planejamento alheio
  // sem perceber — o titulo da tarefa nao anuncia a que sprint ela pertence.
  const outraSprint = (task) =>
    task.sprintId && task.sprintId !== sprint.id
      ? sprintNames[task.sprintId] || 'outra sprint'
      : null;
  const seraoMovidas = tasks.filter(
    (task) => selection.includes(task.id) && !selectedTaskIds.includes(task.id) && outraSprint(task)
  );

  // Sprint encerrada e registro historico: o escopo nao muda em nenhuma direcao.
  // O painel vira leitura — antes ele permitia remover, quando a remocao era o
  // unico jeito de esvaziar a sprint para exclui-la; a exclusao deixou de existir.
  // VIEWER cai no mesmo caminho, por falta de permissao e nao por estado.
  const congelada = isTerminalSprint(sprint.status);
  const somenteLeitura = congelada || readOnly;
  // A composicao vem da API, e nao do cruzamento com as tarefas do projeto: numa
  // sprint encerrada a tarefa pode ter seguido adiante, e ainda assim continua
  // fazendo parte do que aconteceu aqui.
  const membros = sprintTasks;
  // Entrou depois do inicio: e o que distingue o escopo planejado do que foi
  // acrescentado durante a execucao (RF35).
  const posteriores = new Map(
    sprintTasks.map((task) => [
      task.id,
      { depois: task.addedAfterStart === true, veioDe: task.carriedFromSprintId ?? null }
    ])
  );

  const toggle = (taskId) => {
    setSelection((current) =>
      current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId]
    );
  };

  return (
    <section className="sprint-tasks-panel" aria-label={`Tarefas da sprint ${sprint.name}`}>
      <h3>Tarefas de {sprint.name}</h3>
      {congelada ? (
        <p className="field-help">
          Sprint concluída ou cancelada: a composição abaixo é o registro do que aconteceu neste
          período e não pode mais ser alterada.
        </p>
      ) : readOnly ? (
        <p className="field-help">
          Seu perfil no projeto é somente leitura: esta é a composição atual da sprint.
        </p>
      ) : (
        <p className="field-help">
          Marque as tarefas que pertencem a esta sprint. Somente tarefas deste projeto são listadas.
        </p>
      )}
      {/* Tres estados distintos. "Ainda nao sei" nunca pode ser exibido como "nao ha". */}
      {loading ? (
        <p className="empty-state" role="status">
          Carregando tarefas do projeto...
        </p>
      ) : somenteLeitura ? (
        // Somente a composicao registrada. Listar o projeto inteiro com caixas
        // inertes ofereceria uma escolha que nao existe.
        membros.length === 0 ? (
          <p className="empty-state">
            {congelada
              ? 'Esta sprint foi encerrada sem tarefas associadas.'
              : 'Nenhuma tarefa associada a esta sprint.'}
          </p>
        ) : (
          <ul className="sprint-tasks-frozen">
            {membros.map((task) => (
              <li key={task.id}>
                {task.title} — {taskStatusLabels[task.status] || task.status} ·{' '}
                {taskPriorityLabels[task.priority] || task.priority}
                {posteriores.get(task.id)?.depois && (
                  <span className="checkbox-field-hint">Incluída após o início da sprint</span>
                )}
              </li>
            ))}
          </ul>
        )
      ) : tasks.length === 0 ? (
        <p className="empty-state">Nenhuma tarefa cadastrada neste projeto.</p>
      ) : (
        <ul className="sprint-tasks-options">
          {tasks.map((task) => {
            const marcado = selection.includes(task.id);
            const origem = outraSprint(task);
            return (
              <li key={task.id}>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={marcado}
                    disabled={submitting}
                    onChange={() => toggle(task.id)}
                  />
                  <span>
                    {task.title} — {taskStatusLabels[task.status] || task.status} ·{' '}
                    {taskPriorityLabels[task.priority] || task.priority}
                    {origem && (
                      <span className="checkbox-field-hint">
                        Atualmente em {origem} — marcar move a tarefa para cá
                      </span>
                    )}
                    {/* Já dentro da sprint e entrou depois do início: distinguir
                        isso é o que o RF35 mede como mudança de escopo. */}
                    {posteriores.get(task.id)?.depois && (
                      <span className="checkbox-field-hint">Incluída após o início da sprint</span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {/* O rotulo por linha sai de vista quando a lista rola; o resumo fica junto
          do botao, onde a decisao e de fato tomada. */}
      {seraoMovidas.length > 0 && (
        <p className="field-help" role="status">
          {seraoMovidas.length === 1
            ? `"${seraoMovidas[0].title}" será movida de ${outraSprint(seraoMovidas[0])} para ${sprint.name}.`
            : `${seraoMovidas.length} tarefas serão movidas de outras sprints para ${sprint.name}: ` +
              seraoMovidas.map((task) => `"${task.title}" (${outraSprint(task)})`).join(', ') +
              '.'}
        </p>
      )}
      <div className="form-actions">
        {!somenteLeitura && (
          <button
            type="button"
            className="button button-primary"
            // Salvar durante a carga enviaria a seleção vazia e esvaziaria a sprint.
            disabled={loading || submitting}
            title={loading ? 'Aguarde o carregamento das tarefas do projeto.' : undefined}
            onClick={() => onSubmit(selection)}
          >
            {submitting ? 'Salvando...' : 'Salvar tarefas da sprint'}
          </button>
        )}
        <button type="button" className="button button-secondary" onClick={onCancel}>
          Fechar
        </button>
      </div>
    </section>
  );
}
