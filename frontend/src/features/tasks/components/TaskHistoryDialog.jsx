import { useCallback, useEffect, useRef, useState } from 'react';
import { kanbanApi } from '../api/tasks.api.js';
import { normalizeApiError } from '../../../shared/index.js';
import { formatDateTime, formatHistoryValue, historyFieldLabels } from './kanban-display.js';
import { KanbanDialog } from './KanbanDialog.jsx';
import './TaskHistoryDialog.css';

const PAGE_SIZE = 10;

const historyChangeLabels = {
  STATUS: 'Status alterado',
  DEADLINE: 'Prazo alterado',
  RESPONSIBLE: 'Responsável alterado',
  PRIORITY: 'Prioridade alterada',
  SPRINT: 'Sprint alterada'
};

export function TaskHistoryDialog({ projectId, task, members, sprints, returnFocusRef, onClose }) {
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [filters, setFilters] = useState({ startDate: '', endDate: '', field: '' });
  const [appliedFilters, setAppliedFilters] = useState({ startDate: '', endDate: '', field: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestRef = useRef(0);
  const controllerRef = useRef(null);
  const appliedFiltersRef = useRef(appliedFilters);
  appliedFiltersRef.current = appliedFilters;

  const loadHistory = useCallback(
    async (page = 1, nextFilters = appliedFiltersRef.current) => {
      requestRef.current += 1;
      const request = requestRef.current;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setLoading(true);
      setError('');
      try {
        const response = await kanbanApi.listTaskHistory(
          projectId,
          {
            taskId: task.id,
            ...(nextFilters.startDate ? { startDate: nextFilters.startDate } : {}),
            ...(nextFilters.endDate ? { endDate: nextFilters.endDate } : {}),
            ...(nextFilters.field ? { field: nextFilters.field } : {}),
            page,
            limit: PAGE_SIZE
          },
          { signal: controller.signal }
        );
        if (request !== requestRef.current) return;
        setItems(response.data.items || []);
        setPagination(
          response.data.pagination || {
            page,
            total: response.data.total || 0,
            totalPages: 0
          }
        );
      } catch (requestError) {
        if (request !== requestRef.current) return;
        setError(normalizeApiError(requestError, 'Não foi possível carregar o histórico.').message);
      } finally {
        if (request === requestRef.current) {
          controllerRef.current = null;
          setLoading(false);
        }
      }
    },
    [projectId, task.id]
  );

  useEffect(() => {
    void loadHistory(1);
    return () => {
      requestRef.current += 1;
      controllerRef.current?.abort();
    };
  }, [loadHistory]);

  function applyFilters(event) {
    event.preventDefault();
    setAppliedFilters(filters);
    void loadHistory(1, filters);
  }

  function clearFilters() {
    const cleared = { startDate: '', endDate: '', field: '' };
    setFilters(cleared);
    setAppliedFilters(cleared);
    void loadHistory(1, cleared);
  }

  const totalPages = Math.max(1, pagination.totalPages || 1);
  const currentPage = Math.min(pagination.page || 1, totalPages);
  const hasFilters = Object.values(appliedFilters).some(Boolean);

  return (
    <KanbanDialog
      title={`Histórico — #${task.id} ${task.title}`}
      description="Alterações registradas para esta tarefa."
      returnFocusRef={returnFocusRef}
      onClose={onClose}
    >
      <form className="task-history-filters" onSubmit={applyFilters}>
        <label>
          <span>Data inicial</span>
          <input
            type="date"
            value={filters.startDate}
            onChange={(event) =>
              setFilters((current) => ({ ...current, startDate: event.target.value }))
            }
          />
        </label>
        <label>
          <span>Data final</span>
          <input
            type="date"
            value={filters.endDate}
            onChange={(event) =>
              setFilters((current) => ({ ...current, endDate: event.target.value }))
            }
          />
        </label>
        <label>
          <span>Campo</span>
          <select
            value={filters.field}
            onChange={(event) =>
              setFilters((current) => ({ ...current, field: event.target.value }))
            }
          >
            <option value="">Todos os campos</option>
            {Object.entries(historyFieldLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="task-history-filter-actions">
          <button type="submit" className="button button-secondary button-compact">
            Filtrar
          </button>
          {hasFilters && (
            <button
              type="button"
              className="button button-outline button-compact"
              onClick={clearFilters}
            >
              Limpar filtros
            </button>
          )}
        </div>
      </form>

      {error ? (
        <div className="message message-error" role="alert">
          {error}
          <button
            type="button"
            className="text-button"
            onClick={() => void loadHistory(currentPage)}
          >
            Tentar novamente
          </button>
        </div>
      ) : loading ? (
        <p className="empty-state" role="status">
          Carregando histórico...
        </p>
      ) : items.length === 0 ? (
        <p className="empty-state">Nenhuma alteração registrada.</p>
      ) : (
        <div className="task-history-list">
          {items.map((movement) => (
            <article className="task-history-item" key={movement.id}>
              <time dateTime={movement.occurredAt}>{formatDateTime(movement.occurredAt)}</time>
              <strong>{historyChangeLabels[movement.field] || 'Alteração registrada'}</strong>
              <p>
                <span>
                  {formatHistoryValue(movement.field, movement.fromValue, members, sprints)}
                </span>
                <span aria-hidden="true">→</span>
                <span>
                  {formatHistoryValue(movement.field, movement.toValue, members, sprints)}
                </span>
              </p>
              <small>{movement.actor?.name || `Usuário #${movement.actorUserId}`}</small>
            </article>
          ))}
        </div>
      )}

      {!loading && !error && pagination.total > PAGE_SIZE && (
        <nav className="task-history-pagination" aria-label="Paginação do histórico">
          <button
            className="button button-secondary"
            type="button"
            disabled={currentPage === 1}
            onClick={() => void loadHistory(currentPage - 1)}
          >
            Anterior
          </button>
          <span>
            Página {currentPage} de {totalPages}
          </span>
          <button
            className="button button-secondary"
            type="button"
            disabled={currentPage === totalPages}
            onClick={() => void loadHistory(currentPage + 1)}
          >
            Próxima
          </button>
        </nav>
      )}
    </KanbanDialog>
  );
}
