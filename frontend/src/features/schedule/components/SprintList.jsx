import { EmptyState } from '../../../shared/index.js';
import { SprintActionsMenu } from './SprintActionsMenu.jsx';
import {
  formatSprintPeriod,
  isTerminalSprint,
  sprintStatusKey,
  sprintStatusKeyLabels,
  statusBadgeClass,
  summarizeSprintTasks,
  transitionHints
} from './schedule-display.js';

export function SprintList({
  sprints,
  scheduleById = {},
  milestoneNames = {},
  selectedSprintId,
  progressSprintId,
  busySprintId,
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
    <ul className="sprint-list" aria-label="Sprints do projeto" tabIndex={0}>
      {sprints.map((sprint) => {
        const terminal = isTerminalSprint(sprint.status);
        const busy = busySprintId === sprint.id;
        const selected = selectedSprintId === sprint.id;
        const progressOpen = progressSprintId === sprint.id;
        const statusKey = sprintStatusKey(sprint);
        const resumo = summarizeSprintTasks(scheduleById[sprint.id]);
        const bloqueadaPorOutra = Boolean(activeSprintName) && sprint.status === 'PLANEJADA';
        const podeConcluir = sprint.status === 'EM_ANDAMENTO';

        const menuItems = [
          {
            key: 'tarefas',
            label: selected ? 'Ocultar tarefas' : 'Ver tarefas',
            ariaLabel: `${selected ? 'Ocultar' : 'Ver'} tarefas da sprint ${sprint.name}`,
            expanded: selected,
            title: selected
              ? 'Fecha o painel de tarefas desta sprint.'
              : readOnly
                ? 'Abre a composição atual desta sprint.'
                : 'Abre o painel para escolher quais tarefas pertencem a esta sprint.',
            onSelect: () => onSelect(sprint)
          },
          {
            key: 'kanban',
            label: 'Ver no Kanban',
            ariaLabel: `Ver a sprint ${sprint.name} no Kanban`,
            title: 'Abre o quadro filtrado por esta sprint.',
            onSelect: () => onViewInKanban(sprint)
          },
          {
            key: 'evolucao',
            label: progressOpen ? 'Fechar evolução' : 'Ver evolução',
            ariaLabel: `${progressOpen ? 'Fechar' : 'Ver'} evolução da sprint ${sprint.name}`,
            expanded: progressOpen,
            title:
              'Mostra o escopo planejado, o escopo atual e o que mudou depois do planejamento.',
            onSelect: () => onShowProgress(sprint)
          }
        ];
        if (!terminal && !readOnly) {
          menuItems.push(
            {
              key: 'editar',
              label: 'Editar sprint',
              ariaLabel: `Editar a sprint ${sprint.name}`,
              title: 'Carrega nome, objetivo, marco e datas no formulário de edição.',
              onSelect: () => onEdit(sprint)
            },
            {
              key: 'cancelar',
              label: 'Cancelar sprint',
              danger: true,
              disabled: busy,
              ariaLabel: `Cancelar a sprint ${sprint.name}`,
              title: transitionHints.CANCELADA,
              onSelect: () => onChangeStatus(sprint, 'CANCELADA')
            }
          );
        }

        return (
          <li className={`sprint-item ${selected ? 'sprint-item-selected' : ''}`} key={sprint.id}>
            <div className="sprint-item-header">
              <h3>{sprint.name}</h3>
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
                {sprint.status === 'CANCELADA'
                  ? 'Cancelada — tarefas e associações desta sprint estão bloqueadas.'
                  : 'Congelada — tarefas e associações desta sprint estão bloqueadas.'}
              </p>
            )}

            <div
              className="sprint-item-footer"
              role="group"
              aria-label={`Ações da sprint ${sprint.name}`}
            >
              <div className="sprint-item-footer-main">
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
                    Iniciar sprint
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
              </div>

              <SprintActionsMenu sprintName={sprint.name} items={menuItems} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
