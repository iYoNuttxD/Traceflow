import { EmptyState } from '../../../shared/index.js';
import { formatInstant, isMilestoneOverdue, milestoneStatusLabels } from './schedule-display.js';

export function MilestoneList({
  milestones,
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

        return (
          <li className="milestone-item" key={milestone.id}>
            <div className="milestone-item-header">
              <h3>{milestone.title}</h3>
              <span className={`status-badge status-${milestone.status.toLowerCase()}`}>
                {milestoneStatusLabels[milestone.status] || milestone.status}
              </span>
            </div>

            <p className="milestone-meta">
              <span>Previsto para {formatInstant(milestone.dueDate)}</span>
              {/* Atraso comunicado por texto, nunca apenas por cor. */}
              {overdue && <span className="milestone-overdue">Atrasado</span>}
            </p>

            {milestone.description && (
              <p className="milestone-description">{milestone.description}</p>
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
                      : 'Marca o marco como entregue. Pode ser reaberto depois.'
                  }
                  onClick={() => onToggleStatus(milestone)}
                >
                  {done ? 'Reabrir' : 'Concluir'}
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  aria-label={`Editar o marco ${milestone.title}`}
                  title="Carrega título, descrição e data no formulário acima."
                  onClick={() => onEdit(milestone)}
                >
                  Editar
                </button>
                <div className="milestone-actions-end">
                  <button
                    type="button"
                    className="button button-danger"
                    disabled={busy}
                    aria-label={`Excluir o marco ${milestone.title}`}
                    title="Remove o marco do projeto. Esta ação não pode ser desfeita."
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
