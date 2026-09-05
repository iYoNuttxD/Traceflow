import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { deleteTask, kanbanApi, tasksApi } from '../api/tasks.api.js';
import { scheduleApi, sprintStatusKey, sprintStatusKeyLabels } from '../../schedule/index.js';
import { membersApi } from '../../members/index.js';
import { ProjectSectionNav, projectsApi } from '../../projects/index.js';
import { useFrozenSprintBoard } from '../hooks/useFrozenSprintBoard.js';
import { FrozenTaskDetails } from '../components/FrozenTaskDetails.jsx';
import { KanbanBoard } from '../components/KanbanBoard.jsx';
import { KanbanFilters } from '../components/KanbanFilters.jsx';
import { KanbanSummary } from '../components/KanbanSummary.jsx';
import { KANBAN_COLUMNS } from '../components/kanban-display.js';
import {
  countActiveKanbanFilters,
  EMPTY_KANBAN_FILTERS,
  filterBoardBySprints,
  filterKanbanBoard,
  getBoardTasks,
  getKanbanSummary
} from '../components/kanban-view.js';
import { TaskDetailsPanel } from '../components/TaskDetailsPanel.jsx';
import { TaskHistoryDialog } from '../components/TaskHistoryDialog.jsx';
import {
  ContextualErrorPage,
  FeedbackRegion,
  LoadingState,
  classifyPageError,
  getErrorRequestId,
  normalizeApiError,
  useConfirm
} from '../../../shared/index.js';
import './KanbanScreen.css';

const TERMINAL_SPRINT_STATUSES = ['CONCLUIDA', 'CANCELADA'];

function getErrorMessage(error, fallback) {
  return normalizeApiError(error, fallback).message;
}

function findTaskInBoard(board, taskId) {
  return getBoardTasks(board).find((task) => String(task.id) === String(taskId)) || null;
}

function updateBoardWithMovedTask(board, movedTask) {
  if (!board?.columns || !movedTask?.status) return board;
  const columns = Object.fromEntries(
    KANBAN_COLUMNS.map((column) => [
      column.status,
      (board.columns[column.status] || []).filter((task) => task.id !== movedTask.id)
    ])
  );
  columns[movedTask.status] = [movedTask, ...(columns[movedTask.status] || [])];
  const summary = getKanbanSummary({ columns });
  return {
    ...board,
    columns,
    totals: {
      ...summary,
      total: typeof board.totals?.total === 'number' ? board.totals.total : summary.total
    }
  };
}

function removeTaskFromBoard(board, taskId) {
  if (!board?.columns) return board;
  const taskWasVisible = getBoardTasks(board).some((task) => String(task.id) === String(taskId));
  const columns = Object.fromEntries(
    Object.entries(board.columns).map(([status, tasks]) => [
      status,
      tasks.filter((task) => String(task.id) !== String(taskId))
    ])
  );
  const summary = getKanbanSummary({ columns });
  return {
    ...board,
    columns,
    totals: {
      ...summary,
      total:
        typeof board.totals?.total === 'number'
          ? Math.max(0, board.totals.total - (taskWasVisible ? 1 : 0))
          : summary.total
    }
  };
}

export function KanbanScreen() {
  const confirm = useConfirm();
  const { projectId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [project, setProject] = useState(null);
  const [board, setBoard] = useState(null);
  const [projectMembers, setProjectMembers] = useState([]);
  const [currentMembership, setCurrentMembership] = useState(null);
  const [projectSprints, setProjectSprints] = useState([]);
  const [sprintFilter, setSprintFilter] = useState([]);
  const [filters, setFilters] = useState({ ...EMPTY_KANBAN_FILTERS });
  const [selectedTask, setSelectedTask] = useState(null);
  const [openingCurrent, setOpeningCurrent] = useState(false);
  const [currentTaskError, setCurrentTaskError] = useState('');
  const [currentTaskUnavailable, setCurrentTaskUnavailable] = useState(false);
  const currentTaskRequestRef = useRef(0);
  const [historyTask, setHistoryTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [movingTaskId, setMovingTaskId] = useState(null);
  const [deletingTaskId, setDeletingTaskId] = useState(null);
  const [draggingTaskId, setDraggingTaskId] = useState(null);
  const [dragOverStatus, setDragOverStatus] = useState('');
  const [error, setError] = useState('');
  const [pageError, setPageError] = useState(null);
  const [success, setSuccess] = useState('');
  const [warning, setWarning] = useState('');
  const suppressTaskClickRef = useRef(false);
  const searchParamsRef = useRef(searchParams);
  const boardFocusRef = useRef(null);
  const detailsReturnFocusRef = useRef(null);
  const historyReturnFocusRef = useRef(null);
  const contextRef = useRef({ projectId, generation: 0 });
  const requestSequenceRef = useRef(0);
  const requestControllerRef = useRef(null);
  const mutationSequenceRef = useRef(0);
  const mutationPendingRef = useRef(false);
  searchParamsRef.current = searchParams;

  const allTasks = useMemo(() => getBoardTasks(board), [board]);
  const frozenSprint = projectSprints.find(
    (sprint) => sprintFilter.includes(sprint.id) && TERMINAL_SPRINT_STATUSES.includes(sprint.status)
  );
  const frozenView = useFrozenSprintBoard(projectId, frozenSprint?.id);
  const sprintScopedBoard = useMemo(
    () => (frozenSprint ? frozenView.board : filterBoardBySprints(board, sprintFilter)),
    [board, sprintFilter, frozenSprint, frozenView.board]
  );
  const summary = useMemo(() => getKanbanSummary(sprintScopedBoard), [sprintScopedBoard]);
  const visibleBoard = useMemo(
    () => filterKanbanBoard(sprintScopedBoard, filters),
    [filters, sprintScopedBoard]
  );
  const visibleCount = useMemo(() => getBoardTasks(visibleBoard).length, [visibleBoard]);
  const activeFilterCount = useMemo(() => countActiveKanbanFilters(filters), [filters]);
  const sprintNames = useMemo(
    () => Object.fromEntries(projectSprints.map((sprint) => [sprint.id, sprint.name])),
    [projectSprints]
  );
  const sprintStatusText = useMemo(
    () =>
      Object.fromEntries(
        projectSprints.map((sprint) => {
          const key = sprintStatusKey(sprint);
          const frozen = TERMINAL_SPRINT_STATUSES.includes(sprint.status);
          return [
            sprint.id,
            `${sprintStatusKeyLabels[key] || sprint.status}${frozen ? ' · congelada' : ''}`
          ];
        })
      ),
    [projectSprints]
  );
  const frozenSprintIds = useMemo(
    () =>
      new Set(
        projectSprints
          .filter((sprint) => TERMINAL_SPRINT_STATUSES.includes(sprint.status))
          .map((sprint) => sprint.id)
      ),
    [projectSprints]
  );

  const invalidateRequest = useCallback(() => {
    requestSequenceRef.current += 1;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
  }, []);

  const beginRequest = useCallback(() => {
    requestSequenceRef.current += 1;
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    return {
      controller,
      generation: contextRef.current.generation,
      projectId: contextRef.current.projectId,
      requestId: requestSequenceRef.current
    };
  }, []);

  const requestIsCurrent = useCallback(
    (request) =>
      request &&
      !request.controller.signal.aborted &&
      request.requestId === requestSequenceRef.current &&
      request.generation === contextRef.current.generation &&
      String(request.projectId) === String(contextRef.current.projectId),
    []
  );

  const finishRequest = useCallback(
    (request) => {
      if (!requestIsCurrent(request)) return false;
      requestControllerRef.current = null;
      return true;
    },
    [requestIsCurrent]
  );

  const applyBoard = useCallback((nextBoard) => {
    setBoard(nextBoard);
    setSelectedTask((current) => (current ? findTaskInBoard(nextBoard, current.id) : current));
    setHistoryTask((current) => (current ? findTaskInBoard(nextBoard, current.id) : current));
  }, []);

  const loadKanban = useCallback(async () => {
    const request = beginRequest();
    setLoading(true);
    setError('');
    setPageError(null);
    try {
      const options = { signal: request.controller.signal };
      const [projectResponse, boardResponse, membersResponse, sprintsResponse] = await Promise.all([
        projectsApi.get(projectId, options),
        kanbanApi.getBoard(projectId, options),
        membersApi.list(projectId, options),
        scheduleApi.listSprints(projectId, {}, options).catch(() => ({ data: { sprints: [] } }))
      ]);
      if (!requestIsCurrent(request)) return false;
      setProject(projectResponse.data.project);
      applyBoard(boardResponse.data);
      setProjectMembers(membersResponse.members || []);
      setCurrentMembership(membersResponse.currentMembership || null);
      const sprints = sprintsResponse.data.sprints || [];
      setProjectSprints(sprints);
      const requestedIds = (searchParamsRef.current.get('sprint') || '')
        .split(',')
        .map((value) => Number(value))
        .filter((id) => sprints.some((sprint) => sprint.id === id));
      const terminalId = requestedIds.find((id) =>
        sprints.some(
          (sprint) => sprint.id === id && TERMINAL_SPRINT_STATUSES.includes(sprint.status)
        )
      );
      setSprintFilter(terminalId ? [terminalId] : requestedIds);
      return true;
    } catch (requestError) {
      if (requestIsCurrent(request)) {
        setPageError(normalizeApiError(requestError, 'Não foi possível carregar o Kanban.'));
      }
      return false;
    } finally {
      if (finishRequest(request)) setLoading(false);
    }
  }, [applyBoard, beginRequest, finishRequest, projectId, requestIsCurrent]);

  const refreshBoard = useCallback(
    async (confirmedTask = null) => {
      const request = beginRequest();
      try {
        const response = await kanbanApi.getBoard(projectId, {
          signal: request.controller.signal
        });
        if (!requestIsCurrent(request)) return false;
        applyBoard(
          confirmedTask ? updateBoardWithMovedTask(response.data, confirmedTask) : response.data
        );
        return true;
      } catch (requestError) {
        if (requestIsCurrent(request)) throw requestError;
        return false;
      } finally {
        finishRequest(request);
      }
    },
    [applyBoard, beginRequest, finishRequest, projectId, requestIsCurrent]
  );

  const beginMutation = useCallback(() => {
    if (mutationPendingRef.current) return null;
    invalidateRequest();
    mutationPendingRef.current = true;
    mutationSequenceRef.current += 1;
    return {
      generation: contextRef.current.generation,
      mutationId: mutationSequenceRef.current,
      projectId: contextRef.current.projectId
    };
  }, [invalidateRequest]);

  const mutationIsCurrent = useCallback(
    (request) =>
      request &&
      request.mutationId === mutationSequenceRef.current &&
      request.generation === contextRef.current.generation &&
      String(request.projectId) === String(contextRef.current.projectId),
    []
  );

  const finishMutation = useCallback(
    (request) => {
      if (!mutationIsCurrent(request)) return false;
      mutationPendingRef.current = false;
      return true;
    },
    [mutationIsCurrent]
  );

  useEffect(() => {
    contextRef.current = { projectId, generation: contextRef.current.generation + 1 };
    invalidateRequest();
    mutationSequenceRef.current += 1;
    mutationPendingRef.current = false;
    setProject(null);
    setBoard(null);
    setProjectMembers([]);
    setCurrentMembership(null);
    setProjectSprints([]);
    setSprintFilter([]);
    setFilters({ ...EMPTY_KANBAN_FILTERS });
    currentTaskRequestRef.current += 1;
    setSelectedTask(null);
    setHistoryTask(null);
    setLoading(true);
    setError('');
    setPageError(null);
    setSuccess('');
    setWarning('');
    void loadKanban();

    const generation = contextRef.current.generation;
    return () => {
      if (contextRef.current.generation === generation) {
        invalidateRequest();
        mutationSequenceRef.current += 1;
        mutationPendingRef.current = false;
      }
    };
  }, [invalidateRequest, loadKanban, projectId]);

  const applySprintFilter = useCallback(
    (ids) => {
      const added = ids.find((id) => !sprintFilter.includes(id));
      const terminal = ids.find((id) => frozenSprintIds.has(id));
      // Historical cuts are viewed individually; open Sprints retain multi-selection.
      if (added && frozenSprintIds.has(added)) ids = [added];
      else if (added) ids = ids.filter((id) => !frozenSprintIds.has(id));
      else if (terminal) ids = [terminal];
      currentTaskRequestRef.current += 1;
      setSelectedTask(null);
      setHistoryTask(null);
      setFilters({ ...EMPTY_KANBAN_FILTERS });
      setSprintFilter(ids);
      const params = new URLSearchParams(searchParams);
      if (ids.length) params.set('sprint', ids.join(','));
      else params.delete('sprint');
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams, sprintFilter, frozenSprintIds]
  );

  async function moveTaskToStatus(task, toStatus) {
    if (frozenSprint || task.isFrozen || toStatus === task.status) return;
    if (task.sprintId && frozenSprintIds.has(task.sprintId)) {
      setSuccess('');
      setError(
        `A sprint "${sprintNames[task.sprintId] || task.sprintId}" está congelada — as tarefas dela não podem ser movidas.`
      );
      return;
    }
    const mutation = beginMutation();
    if (!mutation) return;
    setMovingTaskId(task.id);
    setError('');
    setSuccess('');
    setWarning('');
    try {
      const response = await kanbanApi.moveTask(task.id, { toStatus });
      if (!mutationIsCurrent(mutation)) return;
      const movedTask = response.data.task;
      setSuccess(response.data.message);
      setBoard((current) => updateBoardWithMovedTask(current, movedTask));
      finishMutation(mutation);
      void refreshBoard(movedTask).catch((requestError) => {
        setWarning(
          getErrorMessage(
            requestError,
            'A tarefa foi movida, mas não foi possível atualizar o Kanban.'
          )
        );
      });
    } catch (requestError) {
      if (!mutationIsCurrent(mutation)) return;
      setError(getErrorMessage(requestError, 'Não foi possível mover a tarefa.'));
      finishMutation(mutation);
      if (requestError.response?.status === 409) void refreshBoard().catch(() => {});
    } finally {
      if (mutationIsCurrent(mutation)) {
        finishMutation(mutation);
        setMovingTaskId(null);
      }
    }
  }

  function handleTaskDragStart(event, task) {
    if (frozenSprint || task.isFrozen || movingTaskId === task.id) {
      event.preventDefault();
      return;
    }
    suppressTaskClickRef.current = true;
    setDraggingTaskId(task.id);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(task.id));
  }

  function handleTaskDragEnd() {
    setDraggingTaskId(null);
    setDragOverStatus('');
  }

  function handleTaskPointerDown() {
    suppressTaskClickRef.current = false;
  }

  async function handleColumnDrop(event, targetStatus) {
    event.preventDefault();
    if (frozenSprint) return;
    setDragOverStatus('');
    const draggedTaskId = event.dataTransfer.getData('text/plain') || draggingTaskId;
    const task = allTasks.find((candidate) => String(candidate.id) === String(draggedTaskId));
    if (task && task.status !== targetStatus) await moveTaskToStatus(task, targetStatus);
  }

  function openTaskDetails(task, trigger) {
    if (suppressTaskClickRef.current) {
      suppressTaskClickRef.current = false;
      return;
    }
    detailsReturnFocusRef.current = trigger;
    setCurrentTaskError('');
    setCurrentTaskUnavailable(false);
    setOpeningCurrent(false);
    setSelectedTask(task);
  }

  async function openCurrentTask(snapshot) {
    const request = ++currentTaskRequestRef.current;
    setOpeningCurrent(true);
    setCurrentTaskError('');
    try {
      const response = await tasksApi.get(snapshot.currentTaskId);
      if (request !== currentTaskRequestRef.current) return;
      setSelectedTask(response.data.task);
    } catch (error) {
      if (request === currentTaskRequestRef.current) {
        const unavailable = error.response?.status === 404;
        setCurrentTaskUnavailable(unavailable);
        setCurrentTaskError(
          unavailable
            ? 'Tarefa atual indisponível. O snapshot histórico foi preservado.'
            : getErrorMessage(error, 'Não foi possível abrir a tarefa atual.')
        );
      }
    } finally {
      if (request === currentTaskRequestRef.current) setOpeningCurrent(false);
    }
  }

  function openTaskHistory(task, trigger) {
    historyReturnFocusRef.current = trigger;
    setHistoryTask(task);
  }

  async function handleDeleteTask(task) {
    const confirmed = await confirm({
      title: 'Excluir tarefa',
      description:
        'Esta ação não poderá ser desfeita. Os vínculos e as movimentações do Kanban serão removidos, mas os artefatos importados do GitHub serão mantidos.',
      confirmLabel: 'Excluir tarefa'
    });
    if (!confirmed) return;

    setDeletingTaskId(task.id);
    setError('');
    setSuccess('');
    setWarning('');
    try {
      const response = await deleteTask(task.id);
      setBoard((current) => removeTaskFromBoard(current, task.id));
      setSelectedTask(null);
      setHistoryTask(null);
      setSuccess(response.message || 'Tarefa excluída com sucesso.');
      try {
        await refreshBoard();
      } catch (requestError) {
        setWarning(
          getErrorMessage(
            requestError,
            'A tarefa foi excluída, mas não foi possível reconciliar o Kanban.'
          )
        );
      }
      window.requestAnimationFrame(() => boardFocusRef.current?.focus());
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível excluir a tarefa.'));
    } finally {
      setDeletingTaskId(null);
    }
  }

  async function handleSaveTask(task, payload) {
    const mutation = beginMutation();
    if (!mutation) throw new Error('Outra alteração da tarefa ainda está em andamento.');
    try {
      const response = await tasksApi.update(task.id, payload);
      if (!mutationIsCurrent(mutation)) return null;
      finishMutation(mutation);
      return response.data.task;
    } catch (requestError) {
      if (!mutationIsCurrent(mutation)) return null;
      finishMutation(mutation);
      throw requestError;
    } finally {
      if (mutationIsCurrent(mutation)) finishMutation(mutation);
    }
  }

  function handleTaskDetailsSaved(updatedTask, outcome = {}) {
    setError('');
    setSuccess(outcome.successMessage || 'Tarefa atualizada com sucesso.');
    setWarning(outcome.warning || '');
    setBoard((current) => updateBoardWithMovedTask(current, updatedTask));
    setSelectedTask(updatedTask);
    void refreshBoard(updatedTask).catch((requestError) => {
      const refreshWarning = getErrorMessage(
        requestError,
        'As alterações foram atualizadas, mas não foi possível reconciliar o Kanban.'
      );
      setWarning((current) => [current, refreshWarning].filter(Boolean).join(' '));
    });
    return updatedTask;
  }

  if (!loading && !project && pageError) {
    return (
      <ContextualErrorPage
        type={classifyPageError(pageError)}
        description={pageError.message}
        requestId={getErrorRequestId(pageError)}
        retryAfterSeconds={pageError.retryAfterSeconds}
        onRetry={loadKanban}
      />
    );
  }

  return (
    <main className="page-container kanban-screen">
      <header className="page-header kanban-screen__header">
        <div>
          <span className="eyebrow">Kanban</span>
          <h1>Kanban de tarefas</h1>
          <p>Acompanhe o fluxo das tarefas e mova o trabalho entre as etapas do projeto.</p>
        </div>
        <ProjectSectionNav projectId={projectId} activeSection="kanban" />
      </header>

      <FeedbackRegion error={error} success={success} />
      <FeedbackRegion warning={warning} />

      {loading ? (
        <LoadingState message="Carregando Kanban..." />
      ) : (
        <>
          <KanbanSummary
            summary={summary}
            frozen={Boolean(frozenSprint)}
            historicalSummary={frozenView.projection?.historicalSummary}
            sprints={projectSprints}
            selectedSprintIds={sprintFilter}
            statusLabels={sprintStatusText}
            onToggleSprint={(id) =>
              applySprintFilter(
                sprintFilter.includes(id)
                  ? sprintFilter.filter((current) => current !== id)
                  : [...sprintFilter, id]
              )
            }
            onClearSprints={() => applySprintFilter([])}
          />

          {frozenView.projection?.historicalLimitations?.length > 0 && (
            <p role="status">
              Snapshot detalhado indisponível para esta Sprint histórica. Campos desconhecidos não
              são reconstruídos.
            </p>
          )}
          {frozenView.projection?.tasks?.some(
            (task) => !KANBAN_COLUMNS.some((column) => column.status === task.status)
          ) && (
            <p role="status">
              Há participações sem status histórico conhecido; elas não podem ser posicionadas no
              quadro.
            </p>
          )}
          <KanbanFilters
            filters={filters}
            members={
              frozenSprint
                ? [
                    ...new Set(
                      (frozenView.projection?.tasks || [])
                        .map((task) => task.responsibleUserId)
                        .filter(Boolean)
                    )
                  ].map((id) => ({ id, user: { id, name: `Responsável #${id}` } }))
                : projectMembers
            }
            activeCount={activeFilterCount}
            visibleCount={visibleCount}
            scopedCount={summary.total}
            onChange={(field, value) => setFilters((current) => ({ ...current, [field]: value }))}
            onClear={() => setFilters({ ...EMPTY_KANBAN_FILTERS })}
          />

          {frozenView.loading ? (
            <LoadingState message="Carregando quadro congelado..." />
          ) : frozenView.error && frozenSprint ? (
            <div role="alert">
              <p>{frozenView.error}</p>
              <button type="button" className="button button-secondary" onClick={frozenView.retry}>
                Tentar novamente
              </button>
            </div>
          ) : (
            <KanbanBoard
              board={visibleBoard}
              isFrozen={Boolean(frozenSprint)}
              movingTaskId={movingTaskId}
              draggingTaskId={draggingTaskId}
              dragOverStatus={dragOverStatus}
              sprintNames={sprintNames}
              selectedSprintIds={sprintFilter}
              frozenSprintIds={frozenSprintIds}
              filteredEmpty={activeFilterCount > 0 && visibleCount === 0 && summary.total > 0}
              boardRef={boardFocusRef}
              onSelectTask={openTaskDetails}
              onOpenHistory={openTaskHistory}
              onTaskPointerDown={handleTaskPointerDown}
              onTaskDragStart={handleTaskDragStart}
              onTaskDragEnd={handleTaskDragEnd}
              onColumnDragOver={(event, status) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setDragOverStatus(status);
              }}
              onColumnDragLeave={(event, status) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setDragOverStatus((current) => (current === status ? '' : current));
                }
              }}
              onColumnDrop={handleColumnDrop}
            />
          )}

          {allTasks.length !== board?.totals?.total && (
            <div className="message message-error" role="alert">
              Existem tarefas com status fora do padrão do Kanban.
            </div>
          )}

          {selectedTask?.isFrozen && (
            <FrozenTaskDetails
              task={selectedTask}
              sprintName={sprintNames[selectedTask.sprintId]}
              historicalLimitations={frozenView.projection?.historicalLimitations}
              unavailable={currentTaskUnavailable}
              returnFocusRef={detailsReturnFocusRef}
              opening={openingCurrent}
              error={currentTaskError}
              onOpenCurrent={openCurrentTask}
              onClose={() => {
                currentTaskRequestRef.current += 1;
                setSelectedTask(null);
              }}
            />
          )}
          {selectedTask && !selectedTask.isFrozen && (
            <TaskDetailsPanel
              key={selectedTask.id}
              projectId={projectId}
              task={selectedTask}
              members={projectMembers}
              canEdit={Boolean(currentMembership && currentMembership.role !== 'VIEWER')}
              canDelete={Boolean(currentMembership && currentMembership.role !== 'VIEWER')}
              deleting={deletingTaskId === selectedTask.id}
              returnFocusRef={detailsReturnFocusRef}
              onClose={() => setSelectedTask(null)}
              onDelete={handleDeleteTask}
              onSave={handleSaveTask}
              onSaved={handleTaskDetailsSaved}
            />
          )}

          {historyTask && (
            <TaskHistoryDialog
              projectId={projectId}
              task={historyTask}
              members={projectMembers}
              sprints={projectSprints}
              returnFocusRef={historyReturnFocusRef}
              onClose={() => setHistoryTask(null)}
            />
          )}
        </>
      )}
    </main>
  );
}
