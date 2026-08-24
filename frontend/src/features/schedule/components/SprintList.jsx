import { EmptyState } from '../../../shared/index.js';
import {
  formatSprintPeriod,
  isTerminalSprint,
  sprintStatusKey,
  sprintStatusKeyLabels,
  statusBadgeClass,
  summarizeSprintTasks,
  transitionHints,
  transitionLabels
} from './schedule-display.js';

export function SprintList({
  sprints,
  // Composição por sprint vinda do agregado, indexada por id. Não é derivada do
  // cruzamento com as tarefas do projeto: numa sprint encerrada a tarefa pode já
  // ter seguido adiante, e o registro daqui não muda por isso.
  scheduleById = {},
  milestoneNames = {},
  selectedSprintId,
  progressSprintId,
  busySprintId,
  // Nome da sprint que hoje bloqueia o início de qualquer outra (ADR-011 D06).
  // Vem pronto para o título explicar QUAL sprint bloqueia — "não é possível
  // iniciar" sem dizer por quê vira adivinhação.
  activeSprintName = '',
  readOnly = false,
  onSelect,
  onShowProgress,
  onEdit,
  onChangeStatus,
  onViewInKanban
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
        const busy = busySprintId === sprint.id;
        const selected = selectedSprintId === sprint.id;
        const statusKey = sprintStatusKey(sprint);
        const resumo = summarizeSprintTasks(scheduleById[sprint.id]);
        // Só uma sprint em andamento por projeto: iniciar fica desabilitado
        // enquanto outra estiver aberta. Oferecer o botão para o backend recusar
        // com 409 transformaria uma regra conhecida numa descoberta pelo erro.
        const bloqueadaPorOutra = Boolean(activeSprintName) && sprint.status === 'PLANEJADA';
        // ATRASADA é EM_ANDAMENTO com a janela vencida: concluir continua sendo a
        // ação esperada, e é justamente quando ela mais importa.
        const podeConcluir = sprint.status === 'EM_ANDAMENTO';

        return (
          <li className={`sprint-item ${selected ? 'sprint-item-selected' : ''}`} key={sprint.id}>
            <div className="sprint-item-header">
              <h3>{sprint.name}</h3>
              {/* Status por texto dentro do badge: nunca apenas por cor. */}
              <span className={statusBadgeClass(statusKey)}>
                {sprintStatusKeyLabels[statusKey] || sprint.status}
              </span>
            </div>

            <p className="sprint-meta">
              <span>Marco: {milestoneNames[sprint.milestoneId] || 'Sem marco'}</span>
              <span>{formatSprintPeriod(sprint)}</span>
              <span>
                {resumo.done} de {resumo.total} {resumo.total === 1 ? 'tarefa' : 'tarefas'}
              </span>
              <span>{resumo.points} pts</span>
            </p>

            {sprint.objective && <p className="sprint-objective">{sprint.objective}</p>}

            {terminal && (
              <p className="milestone-frozen">
                Congelada — tarefas e associações desta sprint estão bloqueadas.
              </p>
            )}

            {/* Cada botão diz o que faz por verbo, e o `title` explica a consequência.
                O aria-label carrega o nome da sprint porque a lista tem vários
                rótulos idênticos para quem navega por leitor de tela.
                Não há ação de excluir: o cronograma é registro histórico do
                projeto e a sprint não é removida em nenhum estado. */}
            <div
              className="sprint-actions"
              role="group"
              aria-label={`Ações da sprint ${sprint.name}`}
            >
              {sprint.status === 'PLANEJADA' && !readOnly && (
                <button
                  type="button"
                  className="button button-primary"
                  disabled={busy || bloqueadaPorOutra}
                  aria-label={`Iniciar a sprint ${sprint.name}`}
                  title={
                    bloqueadaPorOutra
                      ? `Conclua a sprint "${activeSprintName}" para iniciar outra.`
                      : transitionHints.EM_ANDAMENTO
                  }
                  onClick={() => onChangeStatus(sprint, 'EM_ANDAMENTO')}
                >
                  {transitionLabels.EM_ANDAMENTO} sprint
                </button>
              )}

              {podeConcluir && !readOnly && (
                <button
                  type="button"
                  className="button button-primary"
                  disabled={busy}
                  aria-label={`Concluir a sprint ${sprint.name}`}
                  title={transitionHints.CONCLUIDA}
                  onClick={() => onChangeStatus(sprint, 'CONCLUIDA')}
                >
                  Concluir sprint
                </button>
              )}

              <button
                type="button"
                className="button button-secondary"
                onClick={() => onSelect(sprint)}
                aria-expanded={selected}
                // O rótulo acessível acompanha o texto visível: anunciar
                // "Gerenciar" num botão escrito "Ver" descreveria uma ação que
                // este usuário não tem.
                aria-label={`${selected ? 'Fechar' : readOnly ? 'Ver' : 'Gerenciar'} tarefas da sprint ${sprint.name}`}
                title={
                  selected
                    ? 'Fecha o painel de tarefas desta sprint.'
                    : readOnly
                      ? 'Abre a composição atual desta sprint.'
                      : 'Abre o painel para escolher quais tarefas pertencem a esta sprint.'
                }
              >
                {selected ? 'Ocultar tarefas' : 'Tarefas'}
              </button>

              <button
                type="button"
                className="button button-secondary"
                onClick={() => onViewInKanban(sprint)}
                aria-label={`Ver a sprint ${sprint.name} no Kanban`}
                title="Abre o quadro filtrado por esta sprint."
              >
                Ver no Kanban
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

              {!readOnly && (
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={terminal}
                  aria-label={`Editar a sprint ${sprint.name}`}
                  title={
                    terminal
                      ? 'Sprint concluída ou cancelada não pode ser editada.'
                      : 'Carrega nome, objetivo, marco e datas no formulário ao lado.'
                  }
                  onClick={() => onEdit(sprint)}
                >
                  Editar
                </button>
              )}

              {!terminal && !readOnly && (
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
