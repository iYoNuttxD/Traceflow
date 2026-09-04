import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { deleteTask, kanbanApi, tasksApi } from '../api/tasks.api.js';
import { scheduleApi, sprintStatusKey, sprintStatusKeyLabels } from '../../schedule/index.js';
import { membersApi } from '../../members/index.js';
import { ProjectSectionNav, projectsApi } from '../../projects/index.js';
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
  const sprintScopedBoard = useMemo(
    () => filterBoardBySprints(board, sprintFilter),
    [board, sprintFilter]
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
      setSprintFilter(requestedIds);
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
      setSprintFilter(ids);
      const params = new URLSearchParams(searchParams);
      if (ids.length) params.set('sprint', ids.join(','));
      else params.delete('sprint');
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  async function moveTaskToStatus(task, toStatus) {
    if (toStatus === task.status) return;
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
    if (movingTaskId === task.id) {
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
    setSelectedTask(task);
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
    if (!mutation) return null;
    setError('');
    setSuccess('');
    setWarning('');
    try {
      const response = await tasksApi.update(task.id, payload);
      if (!mutationIsCurrent(mutation)) return null;
      const savedTask = response.data.task;
      setBoard((current) => updateBoardWithMovedTask(current, savedTask));
      setSelectedTask(savedTask);
      setSuccess(response.data.message || 'Tarefa atualizada com sucesso.');
      finishMutation(mutation);
      void refreshBoard(savedTask).catch((requestError) => {
        setWarning(
          getErrorMessage(
            requestError,
            'A tarefa foi atualizada, mas não foi possível reconciliar o Kanban.'
          )
        );
      });
      return savedTask;
    } catch (requestError) {
      if (!mutationIsCurrent(mutation)) return null;
      finishMutation(mutation);
      throw requestError;
    } finally {
      if (mutationIsCurrent(mutation)) finishMutation(mutation);
    }
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

          <KanbanFilters
            filters={filters}
            members={projectMembers}
            activeCount={activeFilterCount}
            visibleCount={visibleCount}
            scopedCount={summary.total}
            onChange={(field, value) => setFilters((current) => ({ ...current, [field]: value }))}
            onClear={() => setFilters({ ...EMPTY_KANBAN_FILTERS })}
          />

          <KanbanBoard
            board={visibleBoard}
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

          {allTasks.length !== board?.totals?.total && (
            <div className="message message-error" role="alert">
              Existem tarefas com status fora do padrão do Kanban.
            </div>
          )}

          <TaskDetailsPanel
            task={selectedTask}
            members={projectMembers}
            canEdit={Boolean(currentMembership && currentMembership.role !== 'VIEWER')}
            canDelete={Boolean(currentMembership && currentMembership.role !== 'VIEWER')}
            deleting={deletingTaskId === selectedTask?.id}
            returnFocusRef={detailsReturnFocusRef}
            onClose={() => setSelectedTask(null)}
            onDelete={handleDeleteTask}
            onSave={handleSaveTask}
          />

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
