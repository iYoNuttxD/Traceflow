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
import { projectMembersApi } from '../../members/index.js';
import { scheduleApi, sprintStatusKey, sprintStatusKeyLabels } from '../../schedule/index.js';
import { projectsApi } from '../../projects/index.js';
import { ProjectSectionNav } from '../../projects/index.js';
import { KanbanBoard } from '../components/KanbanBoard.jsx';
import { KanbanSprintFilter } from '../components/KanbanSprintFilter.jsx';
import { KANBAN_COLUMNS } from '../components/kanban-display.js';
import { MovementHistory } from '../components/MovementHistory.jsx';
import { TaskDetailsPanel } from '../components/TaskDetailsPanel.jsx';
import { FeedbackRegion, LoadingState, useConfirm } from '../../../shared/index.js';

const MOVEMENTS_PER_PAGE = 10;
const TERMINAL_SPRINT_STATUSES = ['CONCLUIDA', 'CANCELADA'];

function getErrorMessage(error, fallback) {
  return error.response?.data?.message || fallback;
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
  const [success, setSuccess] = useState('');
  const suppressTaskClickRef = useRef(false);
  const loadedProjectIdRef = useRef(null);

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

  const loadKanban = useCallback(
    async (params = {}) => {
      setLoading(true);
      setError('');

      try {
        const [
          projectResponse,
          boardResponse,
          metricsResponse,
          movementsResponse,
          membersResponse,
          sprintsResponse
        ] = await Promise.all([
          projectsApi.get(projectId),
          kanbanApi.getBoard(projectId),
          kanbanApi.getMetrics(projectId, params),
          kanbanApi.listTaskHistory(projectId, { ...params, page: 1, limit: MOVEMENTS_PER_PAGE }),
          projectMembersApi.listProjectMembers(projectId),
          // Sprints alimentam os rótulos do histórico e o filtro. Falha aqui não
          // pode derrubar o Kanban: cai para lista vazia e o quadro continua
          // funcionando.
          scheduleApi.listSprints(projectId).catch(() => ({ data: { sprints: [] } }))
        ]);

        const members = membersResponse.data.members || [];
        setProject(projectResponse.data.project);
        setBoard(boardResponse.data);
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
        const pedidas = (searchParams.get('sprint') || '')
          .split(',')
          .map((valor) => Number(valor))
          .filter((id) => sprints.some((sprint) => sprint.id === id));
        setSprintFilter(pedidas);
      } catch (requestError) {
        setError(getErrorMessage(requestError, 'Não foi possível carregar o Kanban.'));
      } finally {
        setLoading(false);
      }
    },
    // `searchParams` só é lido na carga inicial, que o ref abaixo garante rodar
    // uma vez por projeto. Está na lista para o verificador de hooks, não porque
    // uma mudança de URL deva recarregar o quadro.
    [projectId, searchParams]
  );

  useEffect(() => {
    if (loadedProjectIdRef.current === projectId) return;
    loadedProjectIdRef.current = projectId;
    void loadKanban();
  }, [loadKanban, projectId]);

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

  async function refreshKanban(
    params = {
      ...buildPeriodParams(period),
      page: movementPage,
      limit: MOVEMENTS_PER_PAGE,
      ...(movementMemberFilter ? { actorUserId: movementMemberFilter } : {}),
      ...(historyFieldFilter ? { field: historyFieldFilter } : {})
    }
  ) {
    const [boardResponse, metricsResponse, movementsResponse] = await Promise.all([
      kanbanApi.getBoard(projectId),
      kanbanApi.getMetrics(projectId, params),
      kanbanApi.listTaskHistory(projectId, params)
    ]);

    setBoard(boardResponse.data);
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

    setMovingTaskId(task.id);
    setError('');
    setSuccess('');

    try {
      const response = await kanbanApi.moveTask(task.id, { toStatus });
      const movedTask = response.data.task;

      setSuccess(response.data.message);
      setBoard((currentBoard) => updateBoardWithMovedTask(currentBoard, movedTask));

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

      setMovingTaskId(null);

      refreshKanban().catch((requestError) => {
        setError(
          getErrorMessage(
            requestError,
            'A tarefa foi movida, mas não foi possível atualizar o Kanban.'
          )
        );
      });
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível mover a tarefa.'));
      if (requestError.response?.status === 409) {
        refreshKanban().catch(() => {});
      }
    } finally {
      setMovingTaskId(null);
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
            onChangeTaskStatus={moveTaskToStatus}
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
            onClose={() => setSelectedTask(null)}
            onDelete={handleDeleteSelectedTask}
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
