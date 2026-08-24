import { KanbanColumn } from './KanbanColumn.jsx';
import {
  formatDate,
  getTraceabilitySummary,
  KANBAN_COLUMNS,
  priorityLabels,
  statusLabels
} from './kanban-display.js';

function KanbanTaskCard({
  task,
  moving,
  dragging,
  sprintName,
  frozen,
  onSelect,
  onKeyboardSelect,
  onDragStart,
  onDragEnd,
  onChangeStatus
}) {
  const priority = task.priority || 'MEDIA';
  // Sprint encerrada é registro (ADR-010 D04): o quadro dela vira somente
  // leitura. Arrastar e o seletor ficam desligados juntos — deixar um dos dois
  // ativo faria a regra valer só pela metade e o backend recusaria com 409.
  const bloqueado = frozen || moving;
  return (
    <article
      className={`kanban-task ${dragging ? 'kanban-task--dragging' : ''} ${moving ? 'kanban-task--moving' : ''}`.trim()}
      role="button"
      tabIndex={0}
      draggable={!bloqueado}
      onClick={() => onSelect(task)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onKeyboardSelect(task);
        }
      }}
      onDragStart={(event) => onDragStart(event, task)}
      onDragEnd={onDragEnd}
    >
      <div className="kanban-task-header">
        <strong>{task.title}</strong>
        <span className={`priority-badge priority-${priority.toLowerCase()}`}>
          {priorityLabels[priority] || priority}
        </span>
      </div>
      <dl className="kanban-task-details">
        <div>
          <dt>Sprint</dt>
          <dd>{sprintName || 'Backlog'}</dd>
        </div>
        <div>
          <dt>Responsável</dt>
          <dd>
            {task.responsibleUser?.name || task.responsible || 'Não informado'}
            {typeof task.estimatedEffort === 'number' ? ` · ${task.estimatedEffort} pts` : ''}
          </dd>
        </div>
        <div>
          <dt>Prazo</dt>
          <dd>{formatDate(task.deadline)}</dd>
        </div>
        <div>
          <dt>Rastreabilidade</dt>
          <dd>{getTraceabilitySummary(task)}</dd>
        </div>
      </dl>
      {frozen && <span className="kanban-task-moving-label">Sprint congelada</span>}
      {moving && <span className="kanban-task-moving-label">Movendo...</span>}
      {/* Alternativa ao arrasto, não substituta: arrastar não existe para quem
          usa teclado ou toque, e antes disto mover uma tarefa exigia mouse.
          O clique e as teclas param aqui — sem isso, escolher uma opção também
          abriria o painel de detalhes do cartão. */}
      <select
        aria-label={`Mover a tarefa ${task.title}`}
        value={task.status}
        disabled={bloqueado}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        onChange={(event) => onChangeStatus(task, event.target.value)}
      >
        {KANBAN_COLUMNS.map((column) => (
          <option key={column.status} value={column.status}>
            {statusLabels[column.status]}
          </option>
        ))}
      </select>
    </article>
  );
}

export function KanbanBoard({
  board,
  movingTaskId,
  draggingTaskId,
  dragOverStatus,
  // Nome por id: o cartão só carrega `sprintId`, e um número solto não diz nada.
  sprintNames = {},
  // Ids de sprints em estado terminal, para o cartão saber que está congelado.
  frozenSprintIds = new Set(),
  onSelectTask,
  onKeyboardSelectTask = onSelectTask,
  onTaskDragStart,
  onTaskDragEnd,
  onColumnDragOver,
  onColumnDragLeave,
  onColumnDrop,
  onChangeTaskStatus
}) {
  return (
    <div className="kanban-board">
      {KANBAN_COLUMNS.map((column) => {
        const tasks = board?.columns?.[column.status] || [];
        return (
          <KanbanColumn
            key={column.status}
            // A contagem vem das tarefas exibidas, e não do total da coluna: com
            // filtro de sprint ativo, o número do servidor descreveria um quadro
            // que não é o que está na tela.
            title={`${column.label} (${tasks.length})`}
            className={dragOverStatus === column.status ? 'kanban-column--drag-over' : ''}
            onDragOver={(event) => onColumnDragOver(event, column.status)}
            onDragLeave={(event) => onColumnDragLeave(event, column.status)}
            onDrop={(event) => onColumnDrop(event, column.status)}
          >
            {tasks.length === 0 ? (
              <p className="kanban-empty">Nenhuma tarefa nesta etapa.</p>
            ) : (
              <div className="kanban-task-list">
                {tasks.map((task) => (
                  <KanbanTaskCard
                    key={task.id}
                    task={task}
                    moving={movingTaskId === task.id}
                    dragging={draggingTaskId === task.id}
                    sprintName={sprintNames[task.sprintId]}
                    frozen={Boolean(task.sprintId) && frozenSprintIds.has(task.sprintId)}
                    onSelect={onSelectTask}
                    onKeyboardSelect={onKeyboardSelectTask}
                    onDragStart={onTaskDragStart}
                    onDragEnd={onTaskDragEnd}
                    onChangeStatus={onChangeTaskStatus}
                  />
                ))}
              </div>
            )}
          </KanbanColumn>
        );
      })}
    </div>
  );
}
