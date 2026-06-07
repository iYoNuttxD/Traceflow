import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, githubApi, kanbanApi } from '../api/api.js';
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

function findSuggestedMovedBy(board, project) {
  const taskResponsible = KANBAN_COLUMNS.flatMap(
    (column) => board?.columns?.[column.status] || []
  ).find((task) => task.responsible)?.responsible;

  return taskResponsible || project?.responsibleTeam || '';
}

export function KanbanPage() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [board, setBoard] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [movements, setMovements] = useState([]);
  const [repositoryMembers, setRepositoryMembers] = useState([]);
  const [membersError, setMembersError] = useState('');
  const [moveTargets, setMoveTargets] = useState({});
  const [movedBy, setMovedBy] = useState('');
  const [manualMovedBy, setManualMovedBy] = useState('');
  const [period, setPeriod] = useState({ startDate: '', endDate: '' });
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

  const loadKanban = useCallback(
    async (params = {}) => {
      setLoading(true);
      setError('');
      setMembersError('');

      try {
        const [projectResponse, boardResponse, metricsResponse, movementsResponse, membersResponse] =
          await Promise.all([
            api.get(`/projects/${projectId}`),
            kanbanApi.getBoard(projectId),
            kanbanApi.getMetrics(projectId, params),
            kanbanApi.listMovements(projectId, params),
            githubApi.listProjectMembers(projectId).catch((memberError) => {
              setMembersError(
                getErrorMessage(
                  memberError,
                  'Não foi possível carregar os integrantes do repositório.'
                )
              );
              return { data: { members: [] } };
            })
          ]);

        const members = membersResponse.data.members || [];
        setProject(projectResponse.data.project);
        setBoard(boardResponse.data);
        setMetrics(metricsResponse.data);
        setMovements(movementsResponse.data.movements || []);
        setRepositoryMembers(members);
        setMovedBy((current) =>
          current.trim() ||
          members[0]?.login ||
          findSuggestedMovedBy(boardResponse.data, projectResponse.data.project)
        );
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
    const responsible = movedBy === '__manual__' ? manualMovedBy.trim() : movedBy.trim();

    if (!responsible) {
      setError('Informe o responsável pela movimentação.');
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
        movedBy: responsible
      });

      setSuccess(response.data.message);
      await refreshKanban();
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
            <label className="field kanban-owner-field">
              <span>Responsável pela movimentação</span>
              {repositoryMembers.length > 0 ? (
                <>
                  <select
                    value={movedBy}
                    onChange={(event) => setMovedBy(event.target.value)}
                  >
                    {repositoryMembers.map((member) => (
                      <option key={member.login} value={member.login}>
                        {member.name || member.login}
                      </option>
                    ))}
                    <option value="__manual__">Informar outro responsável</option>
                  </select>
                  {movedBy === '__manual__' && (
                    <input
                      type="text"
                      value={manualMovedBy}
                      onChange={(event) => setManualMovedBy(event.target.value)}
                      placeholder="Nome ou email"
                    />
                  )}
                </>
              ) : (
                <input
                  type="text"
                  value={movedBy}
                  onChange={(event) => setMovedBy(event.target.value)}
                  placeholder="Nome ou email"
                />
              )}
              {membersError && <small className="field-help field-error">{membersError}</small>}
            </label>

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
                        const selectedStatus = moveTargets[task.id] || task.status;
                        const priority = task.priority || 'MEDIA';

                        return (
                          <article className="kanban-task" key={task.id}>
                            <div className="kanban-task-header">
                              <strong>{task.title}</strong>
                              <span className={`priority-badge priority-${priority.toLowerCase()}`}>
                                {priorityLabels[priority] || priority}
                              </span>
                            </div>

                            <p>{task.description || 'Sem descrição cadastrada.'}</p>

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
                                <dt>Status atual</dt>
                                <dd>{statusLabels[task.status] || task.status}</dd>
                              </div>
                            </dl>

                            <div className="kanban-move-actions">
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
                                disabled={movingTaskId === task.id}
                                onClick={() => handleMoveTask(task)}
                              >
                                {movingTaskId === task.id ? 'Movendo...' : 'Mover'}
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
                <p>Total no período: {movements.length}</p>
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
                <button className="button button-secondary" type="submit">
                  Filtrar
                </button>
                {(metrics?.startDate || metrics?.endDate) && (
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

            {movements.length === 0 ? (
              <p className="empty-state">Nenhuma movimentação registrada.</p>
            ) : (
              <div className="movement-list">
                {movements.map((movement) => (
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
        </>
      )}
    </main>
  );
}
