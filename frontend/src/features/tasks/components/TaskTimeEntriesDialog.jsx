import { useCallback, useEffect, useRef, useState } from 'react';
import { getTaskEffortHistory, getTaskTimeEntries } from '../api/tasks.api.js';
import { normalizeApiError, useConfirm } from '../../../shared/index.js';
import { describeTimeEntry, formatHoursMinutes } from './effort-summary.js';
import { KanbanDialog } from './KanbanDialog.jsx';
import './TaskTimeEntriesDialog.css';

const PAGE_SIZE = 10;
const EMPTY_FILTERS = Object.freeze({ startDate: '', endDate: '', source: '', eventType: '' });

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true">
      <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
      <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3h11V2h-11v1z" />
    </svg>
  );
}

// Histórico completo das sessões, paginado e filtrado no servidor, no mesmo molde
// do diálogo de histórico da tarefa. `refreshKey` muda quando o rastreador registra
// algo novo, para a página aberta refletir o que acabou de acontecer.
export function TaskTimeEntriesDialog({
  taskId,
  taskTitle,
  refreshKey,
  busy = false,
  onDelete,
  onUpdate,
  returnFocusRef,
  onClose
}) {
  const confirm = useConfirm();
  const [view, setView] = useState('history');
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [editHours, setEditHours] = useState('');
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestRef = useRef(0);
  const controllerRef = useRef(null);
  const appliedFiltersRef = useRef(appliedFilters);
  appliedFiltersRef.current = appliedFilters;
  const pageRef = useRef(1);

  const load = useCallback(
    async (page = 1, nextFilters = appliedFiltersRef.current) => {
      requestRef.current += 1;
      const request = requestRef.current;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setLoading(true);
      setError('');
      try {
        const data = await (view === 'history' ? getTaskEffortHistory : getTaskTimeEntries)(
          taskId,
          {
            page,
            limit: PAGE_SIZE,
            ...(nextFilters.startDate ? { startDate: nextFilters.startDate } : {}),
            ...(nextFilters.endDate ? { endDate: nextFilters.endDate } : {}),
            ...(nextFilters.source ? { source: nextFilters.source } : {}),
            ...(view === 'history' && nextFilters.eventType
              ? { eventType: nextFilters.eventType }
              : {})
          },
          { signal: controller.signal }
        );
        if (request !== requestRef.current) return;
        pageRef.current = page;
        setItems(
          view === 'history'
            ? data.items || []
            : (data.entries || []).map((entry) => ({
                ...entry,
                sessionId: entry.id,
                currentEntry: entry,
                eventType: 'CURRENT'
              }))
        );
        setPagination(data.pagination || { page, total: 0, totalPages: 0 });
      } catch (cause) {
        if (request !== requestRef.current) return;
        setError(normalizeApiError(cause, 'Não foi possível carregar as sessões.').message);
      } finally {
        if (request === requestRef.current) {
          controllerRef.current = null;
          setLoading(false);
        }
      }
    },
    [taskId, view]
  );

  useEffect(() => {
    void load(pageRef.current);
    return () => {
      requestRef.current += 1;
      controllerRef.current?.abort();
    };
  }, [load, refreshKey]);

  function applyFilters(event) {
    event.preventDefault();
    setAppliedFilters(filters);
    void load(1, filters);
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    void load(1, EMPTY_FILTERS);
  }

  async function handleDelete(entry) {
    const confirmed = await confirm({
      title: 'Excluir sessão de tempo',
      description:
        'A sessão deixará de contar no esforço realizado. O registro da exclusão permanecerá no histórico. Esta ação não poderá ser desfeita.',
      confirmLabel: 'Excluir'
    });
    if (!confirmed) return;
    const result = await onDelete?.(entry.sessionId);
    if (result) {
      const lastOnPage = items.length === 1 && pageRef.current > 1;
      void load(lastOnPage ? pageRef.current - 1 : pageRef.current);
    }
  }

  const totalPages = Math.max(1, pagination.totalPages || 1);
  const currentPage = Math.min(pagination.page || 1, totalPages);
  const hasFilters = Object.entries(appliedFilters).some(
    ([key, value]) => value && (view === 'history' || key !== 'eventType')
  );

  return (
    <KanbanDialog
      title={`Sessões — #${taskId} ${taskTitle || ''}`.trim()}
      description={
        view === 'history'
          ? 'Histórico de registros, edições e exclusões do esforço. As datas filtram o momento do evento (UTC).'
          : 'Sessões encerradas que compõem o esforço atual. As datas filtram o encerramento (UTC).'
      }
      returnFocusRef={returnFocusRef}
      onClose={onClose}
    >
      <div className="task-time-entries__views" role="group" aria-label="Visualização do esforço">
        <button
          type="button"
          className={`button ${view === 'history' ? 'button-primary' : 'button-secondary'}`}
          aria-pressed={view === 'history'}
          onClick={() => {
            pageRef.current = 1;
            setEditing(null);
            setView('history');
          }}
        >
          Histórico de eventos
        </button>
        <button
          type="button"
          className={`button ${view === 'current' ? 'button-primary' : 'button-secondary'}`}
          aria-pressed={view === 'current'}
          onClick={() => {
            pageRef.current = 1;
            setEditing(null);
            setView('current');
          }}
        >
          Sessões atuais
        </button>
      </div>
      <form className="task-time-entries__filters" onSubmit={applyFilters}>
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
          <span>Origem</span>
          <select
            value={filters.source}
            onChange={(event) =>
              setFilters((current) => ({ ...current, source: event.target.value }))
            }
          >
            <option value="">Todas</option>
            <option value="TIMER">Cronômetro</option>
            <option value="MANUAL">Manual</option>
          </select>
        </label>
        <label>
          <span>Evento</span>
          <select
            disabled={view !== 'history'}
            value={view === 'history' ? filters.eventType : ''}
            onChange={(event) =>
              setFilters((current) => ({ ...current, eventType: event.target.value }))
            }
          >
            <option value="">Todos</option>
            <option value="CREATED">Registrado</option>
            <option value="UPDATED">Editado</option>
            <option value="DELETED">Excluído</option>
          </select>
        </label>
        <div className="task-time-entries__filter-actions">
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

      {editing && (
        <form
          className="task-time-entries__filters"
          onSubmit={async (event) => {
            event.preventDefault();
            const result = await onUpdate?.(editing.id, {
              hours: editHours,
              expectedUpdatedAt: editing.updatedAt
            });
            if (result) {
              setEditing(null);
              void load(pageRef.current);
            } else setError('Não foi possível editar. Atualize o histórico e tente novamente.');
          }}
        >
          <label>
            <span>Duração atual (horas)</span>
            <input
              autoFocus
              type="number"
              min="0.01"
              max="24"
              step="0.01"
              required
              value={editHours}
              onChange={(e) => setEditHours(e.target.value)}
            />
          </label>
          <button className="button button-primary" disabled={busy}>
            Salvar edição
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setEditing(null)}
          >
            Cancelar edição
          </button>
        </form>
      )}
      {error ? (
        <div className="message message-error" role="alert">
          {error}
          <button
            type="button"
            className="button button-outline button-compact"
            onClick={() => void load(currentPage)}
          >
            Tentar novamente
          </button>
        </div>
      ) : loading ? (
        <p className="empty-state" role="status">
          Carregando sessões...
        </p>
      ) : items.length === 0 ? (
        <p className="empty-state">
          {hasFilters ? 'Nenhuma sessão corresponde aos filtros.' : 'Nenhuma sessão registrada.'}
        </p>
      ) : (
        <ul className="task-time-entries__list" aria-label="Sessões registradas">
          {items.map((entry) => (
            <li className="task-time-entries__item" key={entry.id}>
              <span className="task-time-entries__when">
                {entry.eventType === 'CURRENT'
                  ? describeTimeEntry(entry)
                  : `${new Date(entry.occurredAt).toLocaleString('pt-BR')} · ${entry.actor?.name || 'Usuário indisponível'}`}
              </span>
              <span className="task-time-entries__origin">
                {entry.source === 'MANUAL' ? (
                  <span className="task-time-entries__tag">manual</span>
                ) : (
                  <span className="task-time-entries__tag task-time-entries__tag--timer">
                    cronômetro
                  </span>
                )}
                <span className="task-time-entries__tag">
                  {
                    { CREATED: 'Registrado', UPDATED: 'Editado', DELETED: 'Excluído' }[
                      entry.eventType
                    ]
                  }
                </span>
                {entry.eventType !== 'CURRENT' && entry.source === 'TIMER' && (
                  <small>
                    {new Date(entry.snapshotStartedAt).toLocaleString('pt-BR')} →{' '}
                    {entry.snapshotEndedAt
                      ? new Date(entry.snapshotEndedAt).toLocaleString('pt-BR')
                      : 'Não encerrada'}
                  </small>
                )}
              </span>
              <strong className="task-time-entries__duration">
                {entry.eventType === 'CURRENT'
                  ? formatHoursMinutes(entry.durationSeconds)
                  : entry.eventType === 'UPDATED'
                    ? `${formatHoursMinutes(entry.previousSeconds)} → ${formatHoursMinutes(entry.newSeconds)}`
                    : entry.eventType === 'DELETED'
                      ? `Entrada de ${formatHoursMinutes(entry.previousSeconds)}`
                      : formatHoursMinutes(entry.newSeconds)}
              </strong>
              <span className="task-time-entries__actions">
                {entry.canEdit && onUpdate && (
                  <button
                    type="button"
                    className="button button-secondary button-compact"
                    disabled={busy}
                    onClick={() => {
                      setEditing(entry.currentEntry);
                      setEditHours(String(entry.currentEntry.durationSeconds / 3600));
                    }}
                  >
                    Editar sessão
                  </button>
                )}
                {entry.canDelete && (
                  <button
                    type="button"
                    className="task-time-entries__delete"
                    disabled={busy}
                    onClick={() => void handleDelete(entry)}
                    aria-label="Excluir sessão"
                    title="Excluir sessão"
                  >
                    <TrashIcon />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!loading && !error && pagination.total > PAGE_SIZE && (
        <nav className="task-time-entries__pagination" aria-label="Paginação das sessões">
          <button
            className="button button-secondary"
            type="button"
            disabled={currentPage === 1}
            onClick={() => void load(currentPage - 1)}
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
            onClick={() => void load(currentPage + 1)}
          >
            Próxima
          </button>
        </nav>
      )}
    </KanbanDialog>
  );
}
