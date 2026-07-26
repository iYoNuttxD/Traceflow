import { formatDateTime, formatHistoryValue, historyFieldLabels } from './kanban-display.js';

export function MovementHistory({
  movements,
  pagination,
  rangeStart,
  rangeEnd,
  currentPage,
  totalPages,
  pageSize,
  period,
  memberFilter,
  fieldFilter,
  members,
  metrics,
  onPeriodChange,
  onMemberFilterChange,
  onFieldFilterChange,
  onSubmit,
  onClear,
  onPageChange
}) {
  return (
    <section className="kanban-history">
      <div className="kanban-section-header">
        <div>
          <h2>Histórico de tarefas</h2>
          <p>Total filtrado: {pagination.total}</p>
          <p>Exibindo {rangeStart}–{rangeEnd} de {pagination.total}</p>
        </div>
        <form className="kanban-history-filters" onSubmit={onSubmit}>
          <label className="field">
            <span>Data inicial</span>
            <input type="date" value={period.startDate} onChange={(event) => onPeriodChange('startDate', event.target.value)} />
          </label>
          <label className="field">
            <span>Campo</span>
            <select value={fieldFilter} onChange={(event) => onFieldFilterChange(event.target.value)}>
              <option value="">Todos os campos</option>
              {Object.entries(historyFieldLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Data final</span>
            <input type="date" value={period.endDate} onChange={(event) => onPeriodChange('endDate', event.target.value)} />
          </label>
          <label className="field">
            <span>Membro</span>
            <select value={memberFilter} onChange={(event) => onMemberFilterChange(event.target.value)}>
              <option value="">Todos os membros</option>
              {members.filter((member) => member.isActive !== false).map((member) => (
                <option key={member.id} value={member.user?.id || member.userId}>{member.user?.name || 'Membro sem nome'}</option>
              ))}
            </select>
          </label>
          <button className="button button-secondary" type="submit">Filtrar</button>
          {(metrics?.startDate || metrics?.endDate || memberFilter || fieldFilter) && (
            <button className="button button-secondary metrics-clear" type="button" onClick={onClear}>Limpar período</button>
          )}
        </form>
      </div>

      {pagination.total === 0 ? <p className="empty-state">Nenhuma alteração registrada.</p> : (
        <>
          <div className="movement-list">
            {movements.map((movement) => (
              <article className="movement-item" key={movement.id}>
                <strong>{movement.taskTitle || `Tarefa #${movement.taskId}`}</strong>
                <span>{historyFieldLabels[movement.field] || movement.field}: {formatHistoryValue(movement.field, movement.fromValue, members)} para {formatHistoryValue(movement.field, movement.toValue, members)}</span>
                <span>{movement.actor?.name || `Usuário #${movement.actorUserId}`}</span>
                <time dateTime={movement.occurredAt}>{formatDateTime(movement.occurredAt)}</time>
              </article>
            ))}
          </div>
          {pagination.total > pageSize && (
            <div className="movement-pagination">
              <button className="button button-secondary" type="button" disabled={currentPage === 1} onClick={() => onPageChange(Math.max(1, currentPage - 1))}>Anterior</button>
              <span>Página {currentPage} de {totalPages}</span>
              <button className="button button-secondary" type="button" disabled={currentPage === totalPages} onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}>Próxima</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
