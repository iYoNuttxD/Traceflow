import { EmptyState } from '../../../shared/index.js';
import {
  allowedSprintTransitions,
  formatDuration,
  formatSprintPeriod,
  isTerminalSprint,
  sprintStatusLabels,
  transitionHints,
  transitionLabels
} from './schedule-display.js';

// A primeira transicao do estado atual e a acao esperada (avancar a sprint);
// as demais ficam como secundarias para nao competir visualmente.
function primaryTransition(status) {
  const [next] = allowedSprintTransitions[status] || [];
  return next;
}

export function SprintList({
  sprints,
  selectedSprintId,
  progressSprintId,
  busySprintId,
  onSelect,
  onShowProgress,
  onEdit,
  onChangeStatus
}) {
  if (!sprints.length) {
    return (
      <EmptyState
        title="Nenhuma sprint cadastrada."
        description="Cadastre a primeira sprint para montar o cronograma do projeto."
      />
    );
  }

  return (
    // tabIndex torna a lista rolavel por teclado. Nao viramos role="region"
    // aqui: isso apagaria a semantica de lista, que o aria-label ja nomeia.
    <ul className="sprint-list" aria-label="Sprints do projeto" tabIndex={0}>
      {sprints.map((sprint) => {
        const terminal = isTerminalSprint(sprint.status);
        const advance = primaryTransition(sprint.status);
        const busy = busySprintId === sprint.id;
        const selected = selectedSprintId === sprint.id;

        return (
          <li className={`sprint-item ${selected ? 'sprint-item-selected' : ''}`} key={sprint.id}>
            <div className="sprint-item-header">
              <h3>{sprint.name}</h3>
              {/* Status por texto dentro do badge: nunca apenas por cor. */}
              <span className={`status-badge status-${sprint.status.toLowerCase()}`}>
                {sprintStatusLabels[sprint.status] || sprint.status}
              </span>
            </div>

            <p className="sprint-meta">
              <span>{formatSprintPeriod(sprint)}</span>
              {sprint.durationInDays ? <span>{formatDuration(sprint.durationInDays)}</span> : null}
            </p>

            {sprint.objective && <p className="sprint-objective">{sprint.objective}</p>}

            {/* Cada botão diz o que faz por verbo, e o `title` explica a consequência.
                O aria-label carrega o nome da sprint porque a lista tem vários
                "Editar" idênticos para quem navega por leitor de tela.
                Não há ação de excluir: o cronograma é registro histórico do
                projeto e a sprint não é removida em nenhum estado. */}
            <div
              className="sprint-actions"
              role="group"
              aria-label={`Ações da sprint ${sprint.name}`}
            >
              <button
                type="button"
                className={`button ${selected ? 'button-secondary' : 'button-primary'}`}
                onClick={() => onSelect(sprint)}
                aria-expanded={selected}
                aria-label={`${selected ? 'Fechar' : 'Gerenciar'} tarefas da sprint ${sprint.name}`}
                title={
                  selected
                    ? 'Fecha o painel de tarefas desta sprint.'
                    : 'Abre o painel para escolher quais tarefas pertencem a esta sprint.'
                }
              >
                {selected ? 'Fechar tarefas' : 'Gerenciar tarefas'}
              </button>

              <button
                type="button"
                className="button button-secondary"
                onClick={() => onShowProgress(sprint)}
                aria-expanded={progressSprintId === sprint.id}
                aria-label={`${progressSprintId === sprint.id ? 'Fechar' : 'Ver'} evolução da sprint ${sprint.name}`}
                title="Mostra o escopo planejado, o escopo atual e o que mudou depois do planejamento."
              >
                {progressSprintId === sprint.id ? 'Fechar evolução' : 'Ver evolução'}
              </button>

              {advance && (
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={busy}
                  aria-label={`${transitionLabels[advance]} a sprint ${sprint.name}`}
                  title={transitionHints[advance]}
                  onClick={() => onChangeStatus(sprint, advance)}
                >
                  {transitionLabels[advance]}
                </button>
              )}

              <button
                type="button"
                className="button button-secondary"
                disabled={terminal}
                aria-label={`Editar a sprint ${sprint.name}`}
                title={
                  terminal
                    ? 'Sprint concluída ou cancelada não pode ser editada.'
                    : 'Carrega nome, objetivo e datas no formulário acima.'
                }
                onClick={() => onEdit(sprint)}
              >
                Editar
              </button>

              {!terminal && (
                <div className="sprint-actions-end">
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={busy}
                    aria-label={`Cancelar a sprint ${sprint.name}`}
                    title={transitionHints.CANCELADA}
                    onClick={() => onChangeStatus(sprint, 'CANCELADA')}
                  >
                    Cancelar sprint
                  </button>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
