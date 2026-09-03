import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import {
  deleteTask,
  kanbanApi,
  unlinkTaskCommit,
  unlinkTaskIssue,
  unlinkTaskFromPullRequest,
  unlinkTaskRequirement
} from '../api/tasks.api.js';
import { scheduleApi, sprintStatusKey, sprintStatusKeyLabels } from '../../schedule/index.js';
import { membersApi } from '../../members/index.js';
import { projectsApi } from '../../projects/index.js';
import { ProjectSectionNav } from '../../projects/index.js';
import { KanbanBoard } from '../components/KanbanBoard.jsx';
import { KanbanSprintFilter } from '../components/KanbanSprintFilter.jsx';
import { KANBAN_COLUMNS } from '../components/kanban-display.js';
import { MovementHistory } from '../components/MovementHistory.jsx';
import { TaskDetailsPanel } from '../components/TaskDetailsPanel.jsx';
import {
  FeedbackRegion,
  ContextualErrorPage,
  LoadingState,
  classifyPageError,
  getErrorRequestId,
  normalizeApiError,
  useConfirm
} from '../../../shared/index.js';
import './KanbanScreen.css';

const MOVEMENTS_PER_PAGE = 10;
const TERMINAL_SPRINT_STATUSES = ['CONCLUIDA', 'CANCELADA'];

function getErrorMessage(error, fallback) {
  return normalizeApiError(error, fallback).message;
}

function buildPeriodParams(period) {
  const params = {};

  if (period.startDate) {
    params.startDate = period.startDate;
  }

  if (period.endDate) {
    params.endDate = period.endDate;
  }

  return params;
}

function updateTaskInBoard(board, taskId, updater) {
  if (!board?.columns) {
    return board;
  }

  const columns = Object.fromEntries(
    Object.entries(board.columns).map(([status, tasks]) => [
      status,
      tasks.map((task) => (String(task.id) === String(taskId) ? updater(task) : task))
    ])
  );

  return {
    ...board,
    columns
  };
}

function updateBoardWithMovedTask(board, movedTask) {
  if (!board?.columns || !movedTask?.status) {
    return board;
  }

  const columns = KANBAN_COLUMNS.reduce((updatedColumns, column) => {
    updatedColumns[column.status] = (board.columns[column.status] || []).filter(
      (task) => task.id !== movedTask.id
    );
    return updatedColumns;
  }, {});

  if (!columns[movedTask.status]) {
    columns[movedTask.status] = [];
  }

  columns[movedTask.status] = [movedTask, ...columns[movedTask.status]];
  const calculatedTotal = KANBAN_COLUMNS.reduce(
    (total, column) => total + (columns[column.status]?.length || 0),
    0
  );
  const total = typeof board.totals?.total === 'number' ? board.totals.total : calculatedTotal;

  return {
    ...board,
    columns,
    totals: {
      A_FAZER: columns.A_FAZER?.length || 0,
      EM_ANDAMENTO: columns.EM_ANDAMENTO?.length || 0,
      CONCLUIDO: columns.CONCLUIDO?.length || 0,
      total
    }
  };
}

// O quadro mostra o projeto inteiro por padrão. Com filtro, só as tarefas das
// sprints escolhidas — o backlog fica de fora, porque quem filtra por sprint está
// perguntando sobre o que está em execução.
function filterBoardBySprints(board, sprintIds) {
  if (!board?.columns || !sprintIds.length) return board;
  const columns = Object.fromEntries(
    Object.entries(board.columns).map(([status, tasks]) => [
      status,
      tasks.filter((task) => task.sprintId && sprintIds.includes(task.sprintId))
    ])
  );
  return { ...board, columns };
}

function findTaskInBoard(board, taskId) {
  if (!board?.columns || taskId == null) return null;
  return Object.values(board.columns)
    .flat()
    .find((task) => String(task.id) === String(taskId));
}

export function KanbanScreen() {
  const confirm = useConfirm();
  const { projectId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [project, setProject] = useState(null);
  const [board, setBoard] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [movements, setMovements] = useState([]);
  const [projectMembers, setProjectMembers] = useState([]);
  const [projectSprints, setProjectSprints] = useState([]);
  // O filtro de sprints vive na URL: o link "Ver no Kanban" da tela de Sprints
  // chega por aqui, e assim ele é compartilhável e sobrevive ao F5.
  const [sprintFilter, setSprintFilter] = useState([]);
  const [period, setPeriod] = useState({ startDate: '', endDate: '' });
  const [movementMemberFilter, setMovementMemberFilter] = useState('');
  const [historyFieldFilter, setHistoryFieldFilter] = useState('');
  const [movementPage, setMovementPage] = useState(1);
  const [movementPagination, setMovementPagination] = useState({
    page: 1,
    limit: MOVEMENTS_PER_PAGE,
    total: 0,
    totalPages: 0
  });
  const [selectedTask, setSelectedTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [movingTaskId, setMovingTaskId] = useState(null);
  const [deletingTaskId, setDeletingTaskId] = useState(null);
  const [draggingTaskId, setDraggingTaskId] = useState(null);
  const [dragOverStatus, setDragOverStatus] = useState('');
  const [error, setError] = useState('');
  const [pageError, setPageError] = useState(null);
  const [success, setSuccess] = useState('');
  const suppressTaskClickRef = useRef(false);
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;
  const contextRef = useRef({ projectId, generation: 0 });
  const requestSequenceRef = useRef(0);
  const requestControllerRef = useRef(null);
  const mutationSequenceRef = useRef(0);
  const mutationPendingRef = useRef(false);

  const allTasks = useMemo(() => {
    if (!board?.columns) {
      return [];
    }

    return KANBAN_COLUMNS.flatMap((column) => board.columns[column.status] || []);
  }, [board]);

  const visibleBoard = useMemo(
    () => filterBoardBySprints(board, sprintFilter),
    [board, sprintFilter]
  );
  const visibleCount = useMemo(() => {
    if (!visibleBoard?.columns) return 0;
    return KANBAN_COLUMNS.reduce(
      (total, column) => total + (visibleBoard.columns[column.status]?.length || 0),
      0
    );
  }, [visibleBoard]);

  const sprintNames = useMemo(
    () => Object.fromEntries(projectSprints.map((sprint) => [sprint.id, sprint.name])),
    [projectSprints]
  );
  const sprintStatusText = useMemo(
    () =>
      Object.fromEntries(
        projectSprints.map((sprint) => {
          const chave = sprintStatusKey(sprint);
          const congelada = TERMINAL_SPRINT_STATUSES.includes(sprint.status);
          return [
            sprint.id,
            `${sprintStatusKeyLabels[chave] || sprint.status}${congelada ? ' (congelada)' : ''}`
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
  const totalMovementPages = Math.max(1, movementPagination.totalPages || 1);
  const currentMovementPage = Math.min(movementPage, totalMovementPages);
  const movementStartIndex = (currentMovementPage - 1) * MOVEMENTS_PER_PAGE;
  const movementRangeStart = movementPagination.total === 0 ? 0 : movementStartIndex + 1;
  const movementRangeEnd = Math.min(
    movementStartIndex + movements.length,
    movementPagination.total
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
    setSelectedTask((current) =>
      current ? findTaskInBoard(nextBoard, current.id) || null : current
    );
  }, []);

  const loadKanban = useCallback(
    async (params = {}) => {
      const request = beginRequest();
      setLoading(true);
      setError('');
      setPageError(null);

      try {
        const options = { signal: request.controller.signal };
        const [
          projectResponse,
          boardResponse,
          metricsResponse,
          movementsResponse,
          membersResponse,
          sprintsResponse
        ] = await Promise.all([
          projectsApi.get(projectId, options),
          kanbanApi.getBoard(projectId, options),
          kanbanApi.getMetrics(projectId, params, options),
          kanbanApi.listTaskHistory(
            projectId,
            { ...params, page: 1, limit: MOVEMENTS_PER_PAGE },
            options
          ),
          membersApi.list(projectId, options),
          // O catálogo de sprints enriquece filtro e histórico, mas não deve
          // indisponibilizar o quadro quando falhar isoladamente.
          scheduleApi.listSprints(projectId, {}, options).catch(() => ({ data: { sprints: [] } }))
        ]);
        if (!requestIsCurrent(request)) return false;

        const members = membersResponse.members || [];
        setProject(projectResponse.data.project);
        applyBoard(boardResponse.data);
        setMetrics(metricsResponse.data);
        setMovements(movementsResponse.data.items || []);
        setMovementPagination(
          movementsResponse.data.pagination || {
            page: 1,
            limit: MOVEMENTS_PER_PAGE,
            total: movementsResponse.data.total || 0,
            totalPages: 1
          }
        );
        setProjectMembers(members);
        const sprints = sprintsResponse.data.sprints || [];
        setProjectSprints(sprints);

        // As sprints pedidas na URL vencem. Ids inexistentes são descartados em
        // silêncio: uma URL antiga não deve travar a tela.
        const pedidas = (searchParamsRef.current.get('sprint') || '')
          .split(',')
          .map((valor) => Number(valor))
          .filter((id) => sprints.some((sprint) => sprint.id === id));
        setSprintFilter(pedidas);
        return true;
      } catch (requestError) {
        if (requestIsCurrent(request)) {
          setPageError(normalizeApiError(requestError, 'Não foi possível carregar o Kanban.'));
        }
        return false;
      } finally {
        if (finishRequest(request)) setLoading(false);
      }
    },
    [applyBoard, beginRequest, finishRequest, projectId, requestIsCurrent]
  );

  const refreshKanban = useCallback(
    async (
      params = {
        ...buildPeriodParams(period),
        page: movementPage,
        limit: MOVEMENTS_PER_PAGE,
        ...(movementMemberFilter ? { actorUserId: movementMemberFilter } : {}),
        ...(historyFieldFilter ? { field: historyFieldFilter } : {})
      },
      confirmedTask = null
    ) => {
      const request = beginRequest();
      try {
        const options = { signal: request.controller.signal };
        const [boardResponse, metricsResponse, movementsResponse] = await Promise.all([
          kanbanApi.getBoard(projectId, options),
          kanbanApi.getMetrics(projectId, params, options),
          kanbanApi.listTaskHistory(projectId, params, options)
        ]);
        if (!requestIsCurrent(request)) return false;

        // A resposta confirmada da mutation não pode regredir se o refresh
        // imediato observar um snapshot anterior do quadro.
        applyBoard(
          confirmedTask
            ? updateBoardWithMovedTask(boardResponse.data, confirmedTask)
            : boardResponse.data
        );
        setMetrics(metricsResponse.data);
        setMovements(movementsResponse.data.items || []);
        setMovementPagination(
          movementsResponse.data.pagination || {
            page: 1,
            limit: MOVEMENTS_PER_PAGE,
            total: movementsResponse.data.total || 0,
            totalPages: 1
          }
        );
        return true;
      } catch (requestError) {
        if (requestIsCurrent(request)) throw requestError;
        return false;
      } finally {
        finishRequest(request);
      }
    },
    [
      applyBoard,
      beginRequest,
      finishRequest,
      historyFieldFilter,
      movementMemberFilter,
      movementPage,
      period,
      projectId,
      requestIsCurrent
    ]
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
    contextRef.current = {
      projectId,
      generation: contextRef.current.generation + 1
    };
    invalidateRequest();
    mutationSequenceRef.current += 1;
    mutationPendingRef.current = false;
    setProject(null);
    setBoard(null);
    setMetrics(null);
    setMovements([]);
    setProjectMembers([]);
    setProjectSprints([]);
    setSprintFilter([]);
    setSelectedTask(null);
    setMovementPage(1);
    setLoading(true);
    setError('');
    setPageError(null);
    setSuccess('');
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

  // O filtro viaja na URL para o link continuar compartilhável depois de o
  // usuário mexer nele. `replace` evita encher o histórico do navegador com uma
  // entrada por clique de checkbox.
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

  async function moveTaskToStatus(task, toStatus) {
    if (toStatus === task.status) {
      return;
    }

    // Sprint encerrada é registro histórico: o backend recusa a movimentação, e
    // dizer isso aqui evita que a regra apareça como um erro genérico do quadro.
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

    try {
      const response = await kanbanApi.moveTask(task.id, { toStatus });
      if (!mutationIsCurrent(mutation)) return;
      const movedTask = response.data.task;

      setSuccess(response.data.message);
      setBoard((currentBoard) => updateBoardWithMovedTask(currentBoard, movedTask));
      setSelectedTask((current) =>
        current && String(current.id) === String(movedTask.id)
          ? { ...current, ...movedTask }
          : current
      );

      if (response.data.movement) {
        setMetrics((current) =>
          current
            ? {
                ...current,
                totalMovements: (current.totalMovements || 0) + 1
              }
            : current
        );
      }

      finishMutation(mutation);
      void refreshKanban(undefined, movedTask).catch((requestError) => {
        setError(
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
      if (requestError.response?.status === 409) {
        void refreshKanban().catch(() => {});
      }
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

    window.setTimeout(() => {
      suppressTaskClickRef.current = false;
    }, 0);
  }

  function handleColumnDragOver(event, status) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverStatus(status);
  }

  function handleColumnDragLeave(event, status) {
    if (event.currentTarget.contains(event.relatedTarget)) {
      return;
    }

    setDragOverStatus((current) => (current === status ? '' : current));
  }

  async function handleColumnDrop(event, targetStatus) {
    event.preventDefault();
    setDragOverStatus('');

    const draggedTaskId = event.dataTransfer.getData('text/plain') || draggingTaskId;
    const task = allTasks.find((candidate) => String(candidate.id) === String(draggedTaskId));

    if (!task || task.status === targetStatus) {
      return;
    }

    await moveTaskToStatus(task, targetStatus);
  }

  function handleTaskClick(task) {
    if (suppressTaskClickRef.current) {
      return;
    }

    setSelectedTask(task);
  }

  async function handleUnlinkSelectedPullRequest(taskId) {
    setError('');
    setSuccess('');

    try {
      const response = await unlinkTaskFromPullRequest(taskId);
      const updatedTask = response.task;
      setSuccess(response.message || 'Pull request removido da tarefa.');
      setBoard((currentBoard) =>
        updateTaskInBoard(currentBoard, taskId, (task) => ({
          ...task,
          pullRequestId: null,
          pullRequest: null
        }))
      );
      setSelectedTask((current) =>
        current && String(current.id) === String(taskId)
          ? {
              ...current,
              pullRequestId: updatedTask?.pullRequestId || null,
              pullRequest: updatedTask?.pullRequest || null
            }
          : current
      );
    } catch (requestError) {
      setError(
        getErrorMessage(requestError, 'Não foi possível remover o vínculo com o pull request.')
      );
    }
  }

  async function handleUnlinkSelectedTaskRequirement(taskId) {
    setError('');
    setSuccess('');

    try {
      const response = await unlinkTaskRequirement(taskId);
      const updatedTask = response.task;
      setSuccess(response.message || 'Vínculo com requisito removido.');
      setBoard((currentBoard) =>
        updateTaskInBoard(currentBoard, taskId, (task) => ({
          ...task,
          requirementId: null,
          requirement: null
        }))
      );
      setSelectedTask((current) =>
        current && String(current.id) === String(taskId)
          ? {
              ...current,
              requirementId: updatedTask?.requirementId || null,
              requirement: updatedTask?.requirement || null
            }
          : current
      );
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível remover o requisito da tarefa.'));
    }
  }

  async function handleUnlinkSelectedTaskCommit(taskId, commitId) {
    setError('');
    setSuccess('');

    try {
      const response = await unlinkTaskCommit(taskId, commitId);
      const commits = response.commits || [];
      setSuccess(response.message || 'Commit removido da tarefa.');
      setBoard((currentBoard) =>
        updateTaskInBoard(currentBoard, taskId, (task) => ({
          ...task,
          commits
        }))
      );
      setSelectedTask((current) =>
        current && String(current.id) === String(taskId)
          ? {
              ...current,
              commits
            }
          : current
      );
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível remover o commit da tarefa.'));
    }
  }

  async function handleUnlinkSelectedTaskIssue(taskId, issueId) {
    setError('');
    setSuccess('');

    try {
      const response = await unlinkTaskIssue(taskId, issueId);
      const issues = response.issues || [];
      setSuccess(response.message || 'Issue removida da tarefa.');
      setBoard((currentBoard) =>
        updateTaskInBoard(currentBoard, taskId, (task) => ({
          ...task,
          issues
        }))
      );
      setSelectedTask((current) =>
        current && String(current.id) === String(taskId)
          ? {
              ...current,
              issues
            }
          : current
      );
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível remover a issue da tarefa.'));
    }
  }

  async function handleDeleteSelectedTask(task) {
    const confirmed = await confirm({
      title: 'Excluir tarefa',
      description:
        'Esta ação não poderá ser desfeita. Os vínculos com requisito, pull request, commits, issues e movimentações do Kanban serão removidos, mas os artefatos importados do GitHub serão mantidos.',
      confirmLabel: 'Excluir tarefa'
    });

    if (!confirmed) {
      return;
    }

    setDeletingTaskId(task.id);
    setError('');
    setSuccess('');

    try {
      const response = await deleteTask(task.id);
      setSelectedTask(null);
      setSuccess(response.message || 'Tarefa excluída com sucesso.');
      await loadKanban(buildPeriodParams(period));
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível excluir a tarefa.'));
    } finally {
      setDeletingTaskId(null);
    }
  }

  async function handlePeriodSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setMovementPage(1);

    try {
      await refreshKanban({
        ...buildPeriodParams(period),
        ...(movementMemberFilter ? { actorUserId: movementMemberFilter } : {}),
        ...(historyFieldFilter ? { field: historyFieldFilter } : {}),
        page: 1,
        limit: MOVEMENTS_PER_PAGE
      });
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível consultar o período.'));
    }
  }

  async function clearPeriod() {
    setPeriod({ startDate: '', endDate: '' });
    setMovementMemberFilter('');
    setHistoryFieldFilter('');
    setMovementPage(1);
    setError('');
    setSuccess('');

    try {
      await refreshKanban({ page: 1, limit: MOVEMENTS_PER_PAGE });
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível limpar o período.'));
    }
  }

  async function changeMovementPage(nextPage) {
    setMovementPage(nextPage);
    setError('');
    try {
      await refreshKanban({
        ...buildPeriodParams(period),
        ...(movementMemberFilter ? { actorUserId: movementMemberFilter } : {}),
        ...(historyFieldFilter ? { field: historyFieldFilter } : {}),
        page: nextPage,
        limit: MOVEMENTS_PER_PAGE
      });
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível carregar a página do histórico.'));
    }
  }

  return (
    <main className="page-container">
      <Link className="back-link" to={`/projects/${projectId}`}>
        ← Voltar para o projeto
      </Link>

      <header className="page-header kanban-header">
        <div>
          <span className="eyebrow">Projeto #{projectId}</span>
          <h1>Kanban de tarefas</h1>
          <p>
            {project
              ? `Fluxo de trabalho das tarefas de ${project.name}.`
              : 'Organização das tarefas por coluna.'}
          </p>
        </div>
        <ProjectSectionNav projectId={projectId} activeSection="kanban" />
      </header>

      <FeedbackRegion error={error} success={success} />

      {loading ? (
        <LoadingState message="Carregando Kanban..." />
      ) : error && !board ? null : (
        <>
          <section className="kanban-toolbar">
            <KanbanSprintFilter
              sprints={projectSprints}
              selectedIds={sprintFilter}
              statusLabels={sprintStatusText}
              onToggle={(id) =>
                applySprintFilter(
                  sprintFilter.includes(id)
                    ? sprintFilter.filter((atual) => atual !== id)
                    : [...sprintFilter, id]
                )
              }
              onClear={() => applySprintFilter([])}
            />

            <div className="kanban-metric-panel">
              <h2>Tarefas no quadro</h2>
              <strong className="metric-value">{visibleCount}</strong>
              <p className="metric-description">
                de {allTasks.length} {allTasks.length === 1 ? 'tarefa' : 'tarefas'} no projeto
              </p>
            </div>
          </section>

          <KanbanBoard
            board={visibleBoard}
            movingTaskId={movingTaskId}
            draggingTaskId={draggingTaskId}
            dragOverStatus={dragOverStatus}
            sprintNames={sprintNames}
            frozenSprintIds={frozenSprintIds}
            onSelectTask={handleTaskClick}
            onKeyboardSelectTask={setSelectedTask}
            onTaskDragStart={handleTaskDragStart}
            onTaskDragEnd={handleTaskDragEnd}
            onColumnDragOver={handleColumnDragOver}
            onColumnDragLeave={handleColumnDragLeave}
            onColumnDrop={handleColumnDrop}
          />

          <MovementHistory
            movements={movements}
            pagination={movementPagination}
            rangeStart={movementRangeStart}
            rangeEnd={movementRangeEnd}
            currentPage={currentMovementPage}
            totalPages={totalMovementPages}
            pageSize={MOVEMENTS_PER_PAGE}
            period={period}
            memberFilter={movementMemberFilter}
            fieldFilter={historyFieldFilter}
            members={projectMembers}
            sprints={projectSprints}
            metrics={metrics}
            onPeriodChange={(field, value) =>
              setPeriod((current) => ({ ...current, [field]: value }))
            }
            onMemberFilterChange={setMovementMemberFilter}
            onFieldFilterChange={setHistoryFieldFilter}
            onSubmit={handlePeriodSubmit}
            onClear={clearPeriod}
            onPageChange={changeMovementPage}
          />

          {allTasks.length !== board?.totals?.total && (
            <div className="message message-error">
              Existem tarefas com status fora do padrão do Kanban.
            </div>
          )}

          <TaskDetailsPanel
            task={selectedTask}
            deleting={deletingTaskId === selectedTask?.id}
            moving={movingTaskId === selectedTask?.id}
            frozen={Boolean(selectedTask?.sprintId) && frozenSprintIds.has(selectedTask.sprintId)}
            onClose={() => setSelectedTask(null)}
            onDelete={handleDeleteSelectedTask}
            onChangeStatus={moveTaskToStatus}
            onUnlinkRequirement={handleUnlinkSelectedTaskRequirement}
            onUnlinkPullRequest={handleUnlinkSelectedPullRequest}
            onUnlinkCommit={handleUnlinkSelectedTaskCommit}
            onUnlinkIssue={handleUnlinkSelectedTaskIssue}
          />
        </>
      )}
    </main>
  );
}
