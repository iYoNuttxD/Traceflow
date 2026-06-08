import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, kanbanApi, projectMembersApi } from '../api/api.js';
import { KanbanColumn } from '../components/KanbanColumn.jsx';

const KANBAN_COLUMNS = [
  { status: 'A_FAZER', label: 'A Fazer' },
  { status: 'EM_ANDAMENTO', label: 'Em Andamento' },
  { status: 'CONCLUIDO', label: 'Concluído' }
];

const statusLabels = {
  A_FAZER: 'A Fazer',
  EM_ANDAMENTO: 'Em Andamento',
  CONCLUIDO: 'Concluído'
};

const priorityLabels = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  CRITICA: 'Crítica'
};

function getErrorMessage(error, fallback) {
  return error.response?.data?.message || fallback;
}

function formatDate(value) {
  if (!value) {
    return 'Não informado';
  }

  return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function formatDateTime(value) {
  if (!value) {
    return 'Não informado';
  }

  return new Date(value).toLocaleString('pt-BR');
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

  return {
    ...board,
    columns,
    totals: {
      A_FAZER: columns.A_FAZER?.length || 0,
      EM_ANDAMENTO: columns.EM_ANDAMENTO?.length || 0,
      CONCLUIDO: columns.CONCLUIDO?.length || 0,
      total: KANBAN_COLUMNS.reduce(
        (total, column) => total + (columns[column.status]?.length || 0),
        0
      )
    }
  };
}

export function KanbanPage() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [board, setBoard] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [movements, setMovements] = useState([]);
  const [projectMembers, setProjectMembers] = useState([]);
  const [selectedProjectMemberId, setSelectedProjectMemberId] = useState('');
  const [moveTargets, setMoveTargets] = useState({});
  const [period, setPeriod] = useState({ startDate: '', endDate: '' });
  const [movementMemberFilter, setMovementMemberFilter] = useState('');
  const [selectedTask, setSelectedTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [movingTaskId, setMovingTaskId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const allTasks = useMemo(() => {
    if (!board?.columns) {
      return [];
    }

    return KANBAN_COLUMNS.flatMap((column) => board.columns[column.status] || []);
  }, [board]);

  const filteredMovements = useMemo(() => {
    if (!movementMemberFilter) {
      return movements;
    }

    const selectedMember = projectMembers.find(
      (member) => String(member.id) === String(movementMemberFilter)
    );

    return movements.filter((movement) => {
      if (movement.projectMemberId !== undefined && movement.projectMemberId !== null) {
        return String(movement.projectMemberId) === String(movementMemberFilter);
      }

      return selectedMember ? movement.movedBy === selectedMember.name : false;
    });
  }, [movementMemberFilter, movements, projectMembers]);

  const loadKanban = useCallback(
    async (params = {}) => {
      setLoading(true);
      setError('');

      try {
        const [projectResponse, boardResponse, metricsResponse, movementsResponse, membersResponse] =
          await Promise.all([
            api.get(`/projects/${projectId}`),
            kanbanApi.getBoard(projectId),
            kanbanApi.getMetrics(projectId, params),
            kanbanApi.listMovements(projectId, params),
            projectMembersApi.listProjectMembers(projectId)
          ]);

        const members = membersResponse.data.members || [];
        setProject(projectResponse.data.project);
        setBoard(boardResponse.data);
        setMetrics(metricsResponse.data);
        setMovements(movementsResponse.data.movements || []);
        setProjectMembers(members);
        setSelectedProjectMemberId((current) => current || String(members[0]?.id || ''));
        setMoveTargets({});
      } catch (requestError) {
        setError(getErrorMessage(requestError, 'Não foi possível carregar o Kanban.'));
      } finally {
        setLoading(false);
      }
    },
    [projectId]
  );

  useEffect(() => {
    loadKanban();
  }, [loadKanban]);

  useEffect(() => {
    if (projectMembers.length === 0) {
      setSelectedProjectMemberId('');
      return;
    }

    const selectedStillExists = projectMembers.some(
      (member) => String(member.id) === String(selectedProjectMemberId)
    );

    if (!selectedStillExists) {
      setSelectedProjectMemberId(String(projectMembers[0].id));
    }
  }, [projectMembers, selectedProjectMemberId]);

  async function refreshKanban(params = buildPeriodParams(period)) {
    const [boardResponse, metricsResponse, movementsResponse] = await Promise.all([
      kanbanApi.getBoard(projectId),
      kanbanApi.getMetrics(projectId, params),
      kanbanApi.listMovements(projectId, params)
    ]);

    setBoard(boardResponse.data);
    setMetrics(metricsResponse.data);
    setMovements(movementsResponse.data.movements || []);
    setMoveTargets({});
  }

  async function handleMoveTask(task) {
    const toStatus = moveTargets[task.id] || task.status;

    if (!selectedProjectMemberId) {
      setError('Selecione um membro do projeto responsável pela movimentação.');
      setSuccess('');
      return;
    }

    if (toStatus === task.status) {
      setError('A tarefa já está nesta coluna.');
      setSuccess('');
      return;
    }

    setMovingTaskId(task.id);
    setError('');
    setSuccess('');

    try {
      const response = await kanbanApi.moveTask(task.id, {
        toStatus,
        projectMemberId: Number(selectedProjectMemberId)
      });
      const movedTask = response.data.task;

      setSuccess(response.data.message);
      setBoard((currentBoard) => updateBoardWithMovedTask(currentBoard, movedTask));
      setMoveTargets((current) => {
        const nextTargets = { ...current };
        delete nextTargets[task.id];
        return nextTargets;
      });

      if (response.data.movement) {
        setMovements((current) => [
          {
            ...response.data.movement,
            taskTitle: movedTask?.title || task.title
          },
          ...current
        ]);
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
    } finally {
      setMovingTaskId(null);
    }
  }

  async function handlePeriodSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');

    try {
      await refreshKanban(buildPeriodParams(period));
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível consultar o período.'));
    }
  }

  async function clearPeriod() {
    setPeriod({ startDate: '', endDate: '' });
    setMovementMemberFilter('');
    setError('');
    setSuccess('');

    try {
      await refreshKanban({});
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível limpar o período.'));
    }
  }

  return (
    <main className="page-container">
      <Link className="back-link" to={`/projects/${projectId}/tasks`}>
        Voltar para tarefas
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
        <Link className="button button-secondary link-button" to={`/projects/${projectId}`}>
          Ver projeto
        </Link>
      </header>

      {error && <div className="message message-error">{error}</div>}
      {success && <div className="message message-success">{success}</div>}

      {loading ? (
        <p className="empty-state">Carregando Kanban...</p>
      ) : (
        <>
          <section className="kanban-toolbar">
            <div className="field kanban-owner-field">
              <span>Responsável pela movimentação</span>
              {projectMembers.length > 0 ? (
                <select
                  value={selectedProjectMemberId}
                  onChange={(event) => setSelectedProjectMemberId(event.target.value)}
                >
                  {projectMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name} {member.role ? `- ${member.role}` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="kanban-members-empty">
                  Nenhum membro interno cadastrado. Cadastre membros no projeto para atribuir
                  responsáveis às tarefas.
                </p>
              )}
            </div>

            <div className="kanban-metric-panel">
              <span className="eyebrow">{metrics?.indicator}</span>
              <strong className="metric-value">{metrics?.totalMovements ?? 0}</strong>
              <p className="metric-description">
                {metrics?.metric || 'Número de movimentações entre colunas'}
              </p>
            </div>
          </section>

          <div className="kanban-board">
            {KANBAN_COLUMNS.map((column) => {
              const columnTasks = board?.columns?.[column.status] || [];

              return (
                <KanbanColumn
                  key={column.status}
                  title={`${column.label} (${board?.totals?.[column.status] ?? 0})`}
                >
                  {columnTasks.length === 0 ? (
                    <p className="kanban-empty">Nenhuma tarefa nesta etapa.</p>
                  ) : (
                    <div className="kanban-task-list">
                      {columnTasks.map((task) => {
                        const selectedStatus = moveTargets[task.id] || '';
                        const priority = task.priority || 'MEDIA';
                        const isMovingThisTask = movingTaskId === task.id;
                        const hasStatusChange =
                          Boolean(selectedStatus) && selectedStatus !== task.status;

                        return (
                          <article
                            className="kanban-task"
                            key={task.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedTask(task)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                setSelectedTask(task);
                              }
                            }}
                          >
                            <div className="kanban-task-header">
                              <strong>{task.title}</strong>
                              <span className={`priority-badge priority-${priority.toLowerCase()}`}>
                                {priorityLabels[priority] || priority}
                              </span>
                            </div>

                            <dl className="kanban-task-details">
                              <div>
                                <dt>Responsável</dt>
                                <dd>{task.responsible || 'Não informado'}</dd>
                              </div>
                              <div>
                                <dt>Prazo</dt>
                                <dd>{formatDate(task.deadline)}</dd>
                              </div>
                              <div>
                                <dt>Rastreabilidade</dt>
                                <dd>
                                  {task.pullRequest ? (
                                    task.pullRequest.githubUrl ? (
                                      <a
                                        href={task.pullRequest.githubUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        onClick={(event) => event.stopPropagation()}
                                      >
                                        PR #{task.pullRequest.number} — {task.pullRequest.title}
                                      </a>
                                    ) : (
                                      `PR #${task.pullRequest.number} — ${task.pullRequest.title}`
                                    )
                                  ) : (
                                    'Sem PR vinculado'
                                  )}
                                </dd>
                              </div>
                            </dl>

                            <div
                              className="kanban-move-actions"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <label className="inline-status">
                                <span>Nova coluna</span>
                                <select
                                  value={selectedStatus}
                                  onChange={(event) =>
                                    setMoveTargets((current) => ({
                                      ...current,
                                      [task.id]: event.target.value
                                    }))
                                  }
                                >
                                  <option value="">Selecione a nova coluna</option>
                                  {KANBAN_COLUMNS.map((option) => (
                                    <option key={option.status} value={option.status}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <button
                                className="button button-primary"
                                type="button"
                                disabled={isMovingThisTask || !hasStatusChange}
                                onClick={() => handleMoveTask(task)}
                              >
                                {isMovingThisTask ? 'Movendo...' : 'Mover'}
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </KanbanColumn>
              );
            })}
          </div>

          <section className="kanban-history">
            <div className="kanban-section-header">
              <div>
                <h2>Histórico de movimentações</h2>
                <p>Total exibido: {filteredMovements.length}</p>
              </div>

              <form className="metrics-form kanban-period-form" onSubmit={handlePeriodSubmit}>
                <label className="field">
                  <span>Data inicial</span>
                  <input
                    type="date"
                    value={period.startDate}
                    onChange={(event) =>
                      setPeriod((current) => ({ ...current, startDate: event.target.value }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Data final</span>
                  <input
                    type="date"
                    value={period.endDate}
                    onChange={(event) =>
                      setPeriod((current) => ({ ...current, endDate: event.target.value }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Membro</span>
                  <select
                    value={movementMemberFilter}
                    onChange={(event) => setMovementMemberFilter(event.target.value)}
                  >
                    <option value="">Todos os membros</option>
                    {projectMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name || member.email || 'Membro sem nome'}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="button button-secondary" type="submit">
                  Filtrar
                </button>
                {(metrics?.startDate || metrics?.endDate || movementMemberFilter) && (
                  <button
                    className="button button-secondary metrics-clear"
                    type="button"
                    onClick={clearPeriod}
                  >
                    Limpar período
                  </button>
                )}
              </form>
            </div>

            {filteredMovements.length === 0 ? (
              <p className="empty-state">Nenhuma movimentação registrada.</p>
            ) : (
              <div className="movement-list">
                {filteredMovements.map((movement) => (
                  <article className="movement-item" key={movement.id}>
                    <strong>{movement.taskTitle || `Tarefa #${movement.taskId}`}</strong>
                    <span>
                      {statusLabels[movement.fromStatus] || movement.fromStatus} para{' '}
                      {statusLabels[movement.toStatus] || movement.toStatus}
                    </span>
                    <span>{movement.movedBy}</span>
                    <time dateTime={movement.movedAt}>{formatDateTime(movement.movedAt)}</time>
                  </article>
                ))}
              </div>
            )}
          </section>

          {allTasks.length !== board?.totals?.total && (
            <div className="message message-error">
              Existem tarefas com status fora do padrão do Kanban.
            </div>
          )}

          {selectedTask && (
            <div
              className="task-detail-overlay"
              role="presentation"
              onClick={() => setSelectedTask(null)}
            >
              <section
                className="task-detail-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="task-detail-title"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="task-detail-header">
                  <div>
                    <span className="eyebrow">Detalhes da tarefa</span>
                    <h2 id="task-detail-title">{selectedTask.title}</h2>
                  </div>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => setSelectedTask(null)}
                  >
                    Fechar
                  </button>
                </div>

                <p className="task-detail-description">
                  {selectedTask.description || 'Sem descrição cadastrada.'}
                </p>

                <dl className="task-detail-grid">
                  <div>
                    <dt>Prioridade</dt>
                    <dd>{priorityLabels[selectedTask.priority] || selectedTask.priority}</dd>
                  </div>
                  <div>
                    <dt>Responsável</dt>
                    <dd>{selectedTask.responsible || 'Não informado'}</dd>
                  </div>
                  <div>
                    <dt>Prazo</dt>
                    <dd>{formatDate(selectedTask.deadline)}</dd>
                  </div>
                  <div>
                    <dt>Status atual</dt>
                    <dd>{statusLabels[selectedTask.status] || selectedTask.status}</dd>
                  </div>
                  <div>
                    <dt>Esforço estimado</dt>
                    <dd>{selectedTask.estimatedEffort ?? 'Não informado'}</dd>
                  </div>
                  <div>
                    <dt>Esforço realizado</dt>
                    <dd>{selectedTask.actualEffort ?? 'Não informado'}</dd>
                  </div>
                  <div>
                    <dt>Data de criação</dt>
                    <dd>{formatDateTime(selectedTask.createdAt)}</dd>
                  </div>
                </dl>

                <div className="task-detail-traceability">
                  <span>Pull request vinculado</span>
                  {selectedTask.pullRequest ? (
                    <>
                      <strong>
                        #{selectedTask.pullRequest.number} — {selectedTask.pullRequest.title}
                      </strong>
                      <p>Status: {selectedTask.pullRequest.state || 'não informado'}</p>
                      <p>Autor: {selectedTask.pullRequest.authorUsername || 'não informado'}</p>
                      {selectedTask.pullRequest.githubUrl && (
                        <a
                          href={selectedTask.pullRequest.githubUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Abrir no GitHub
                        </a>
                      )}
                    </>
                  ) : (
                    <p>Sem PR vinculado.</p>
                  )}
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </main>
  );
}
