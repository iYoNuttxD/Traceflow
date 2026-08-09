import { useEffect, useState } from 'react';
import { isTerminalSprint, taskPriorityLabels, taskStatusLabels } from './schedule-display.js';

// Associa e desassocia tarefas da sprint selecionada.
// A substituicao e atomica no backend: falha em qualquer item nao persiste nada.
export function SprintTasksPanel({
  sprint,
  tasks,
  selectedTaskIds,
  sprintNames = {},
  loading = false,
  submitting,
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

  const terminal = isTerminalSprint(sprint.status);
  // Em sprint terminal so a remocao e permitida. Bloquear tambem a remocao
  // prenderia a sprint: o DELETE exige conjunto vazio e o status nao volta atras.
  const podeMarcar = (taskId) => !terminal || selectedTaskIds.includes(taskId);
  const removeu = selectedTaskIds.some((id) => !selection.includes(id));
  const podeSalvar = terminal ? removeu : true;

  const toggle = (taskId) => {
    setSelection((current) =>
      current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId]
    );
  };

  return (
    <section className="sprint-tasks-panel" aria-label={`Tarefas da sprint ${sprint.name}`}>
      <h3>Tarefas de {sprint.name}</h3>
      {terminal ? (
        <p className="field-help">
          Sprint concluída ou cancelada não aceita novas tarefas. Você ainda pode remover as que já
          estão associadas — necessário, por exemplo, antes de excluir a sprint.
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
      ) : tasks.length === 0 ? (
        <p className="empty-state">Nenhuma tarefa cadastrada neste projeto.</p>
      ) : (
        <ul className="sprint-tasks-options">
          {tasks.map((task) => {
            const marcado = selection.includes(task.id);
            const origem = outraSprint(task);
            const bloqueado = submitting || (!marcado && !podeMarcar(task.id));
            // Uma caixa desabilitada precisa dizer por que esta desabilitada.
            const motivo =
              bloqueado && !submitting
                ? 'Sprint concluída ou cancelada não aceita novas tarefas. O escopo de uma sprint encerrada é registro histórico.'
                : undefined;
            return (
              <li key={task.id}>
                <label
                  className={`checkbox-field ${bloqueado ? 'checkbox-field-disabled' : ''}`}
                  title={motivo}
                >
                  <input
                    type="checkbox"
                    checked={marcado}
                    disabled={bloqueado}
                    aria-describedby={motivo ? `task-bloqueada-${task.id}` : undefined}
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
                    {motivo && (
                      <span className="checkbox-field-hint" id={`task-bloqueada-${task.id}`}>
                        Não pode ser adicionada a uma sprint encerrada
                      </span>
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
        <button
          type="button"
          className="button button-primary"
          // Salvar durante a carga enviaria a seleção vazia e esvaziaria a sprint.
          disabled={loading || submitting || !podeSalvar}
          title={
            loading
              ? 'Aguarde o carregamento das tarefas do projeto.'
              : terminal && !removeu
                ? 'Desmarque ao menos uma tarefa para remover da sprint.'
                : undefined
          }
          onClick={() => onSubmit(selection)}
        >
          {submitting ? 'Salvando...' : terminal ? 'Confirmar remoção' : 'Salvar tarefas da sprint'}
        </button>
        <button type="button" className="button button-secondary" onClick={onCancel}>
          Fechar
        </button>
      </div>
    </section>
  );
}
