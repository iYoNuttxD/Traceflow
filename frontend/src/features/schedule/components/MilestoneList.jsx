import { EmptyState } from '../../../shared/index.js';
import {
  formatInstant,
  isMilestoneOverdue,
  milestoneProgress,
  milestoneStatusLabels,
  sprintStatusKey,
  sprintStatusKeyLabels,
  statusBadgeClass
} from './schedule-display.js';

export function MilestoneList({
  milestones,
  // Sprints do projeto. O marco não carrega a lista das suas: o agrupamento é
  // lido do outro lado (`sprint.milestoneId`), e é aqui que ele vira progresso.
  sprints = [],
  busyMilestoneId,
  readOnly = false,
  onEdit,
  onDelete,
  onToggleStatus
}) {
  if (!milestones.length) {
    return (
      <EmptyState
        title="Nenhum marco cadastrado."
        description="Cadastre marcos para acompanhar as entregas previstas do projeto."
      />
    );
  }

  return (
    // Mesmo tratamento da lista de sprints: rolavel por teclado, sem perder a
    // semantica de lista.
    <ul className="milestone-list" aria-label="Marcos do projeto" tabIndex={0}>
      {milestones.map((milestone) => {
        // `overdue` vem do backend no agregado; nesta lista completa ele nao
        // existe, entao e derivado localmente apenas para exibicao.
        const overdue = milestone.overdue ?? isMilestoneOverdue(milestone);
        const done = milestone.status === 'CONCLUIDO';
        const busy = busyMilestoneId === milestone.id;
        const progresso = milestoneProgress(milestone.id, sprints);
        // O badge diz o estado real: concluído, atrasado ou pendente. "Atrasado"
        // só faz sentido enquanto há o que entregar.
        const statusKey = done ? 'CONCLUIDO' : overdue ? 'ATRASADO' : 'PENDENTE';

        return (
          <li className="milestone-item" key={milestone.id}>
            <div className="milestone-item-header">
              <h3>{milestone.title}</h3>
              <span className={statusBadgeClass(statusKey)}>
                {statusKey === 'ATRASADO'
                  ? 'Atrasado'
                  : milestoneStatusLabels[milestone.status] || milestone.status}
              </span>
            </div>

            <p className="milestone-meta">
              <span>Prazo: {formatInstant(milestone.dueDate)}</span>
              <span>
                {progresso.done} de {progresso.total}{' '}
                {progresso.total === 1 ? 'sprint concluída' : 'sprints concluídas'}
              </span>
            </p>

            {/* A barra repete em forma o que a linha acima já diz em número: ela
                acelera a leitura, não a substitui. */}
            <div className="traceability-progress">
              <div className="traceability-progress-bar">
                <span style={{ width: `${progresso.percent}%` }} />
              </div>
            </div>

            {milestone.description && (
              <p className="milestone-description">{milestone.description}</p>
            )}

            {progresso.sprints.length > 0 && (
              <p className="milestone-meta" aria-label={`Sprints do marco ${milestone.title}`}>
                {progresso.sprints.map((sprint) => {
                  const key = sprintStatusKey(sprint);
                  return (
                    <span className={statusBadgeClass(key)} key={sprint.id}>
                      {sprint.name} · {sprintStatusKeyLabels[key] || sprint.status}
                    </span>
                  );
                })}
              </p>
            )}

            {/* Explicar a automação onde ela aconteceu: sem isso, o marco aparece
                concluído sem que ninguém tenha clicado em concluir, e a tela
                parece ter feito algo por conta própria. */}
            {done && progresso.allConcluded && (
              <p className="milestone-frozen">
                Concluído automaticamente — todas as sprints deste marco foram concluídas.
              </p>
            )}

            {/* VIEWER lê o cronograma inteiro, mas não age sobre ele. */}
            {readOnly ? null : (
              <div
                className="milestone-actions"
                role="group"
                aria-label={`Ações do marco ${milestone.title}`}
              >
                <button
                  type="button"
                  className={`button ${done ? 'button-secondary' : 'button-primary'}`}
                  disabled={busy}
                  aria-label={`${done ? 'Reabrir' : 'Concluir'} o marco ${milestone.title}`}
                  title={
                    done
                      ? 'Volta o marco para pendente. Pode ser desfeito a qualquer momento.'
                      : 'Marca o marco como entregue antes de todas as sprints terminarem. Pode ser reaberto depois.'
                  }
                  onClick={() => onToggleStatus(milestone)}
                >
                  {done ? 'Reabrir' : 'Concluir'}
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  aria-label={`Editar o marco ${milestone.title}`}
                  title="Carrega título, descrição e prazo no formulário ao lado."
                  onClick={() => onEdit(milestone)}
                >
                  Editar
                </button>
                <div className="milestone-actions-end">
                  <button
                    type="button"
                    className="button button-danger"
                    // Excluir um marco com sprints desfaria o agrupamento; o
                    // backend recusa com 409. Desabilitar aqui evita transformar
                    // uma regra conhecida numa descoberta pelo erro.
                    disabled={busy || progresso.sprints.length > 0}
                    aria-label={`Excluir o marco ${milestone.title}`}
                    title={
                      progresso.sprints.length > 0
                        ? 'Marco com sprints não pode ser excluído. Mova-as para outro marco antes.'
                        : 'Remove o marco do projeto. Esta ação não pode ser desfeita.'
                    }
                    onClick={() => onDelete(milestone)}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
