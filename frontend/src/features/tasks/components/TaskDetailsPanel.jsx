import {
  formatCommitLabel,
  formatDate,
  formatDateTime,
  formatIssueLabel,
  formatIssueLabels,
  formatRequirementLabel,
  priorityLabels,
  requirementStatusLabels,
  statusLabels
} from './kanban-display.js';
import { isTaskOverdue } from './kanban-view.js';
import { KanbanDialog } from './KanbanDialog.jsx';
import { TaskComments } from './TaskComments.jsx';
import './TaskDetailsPanel.css';

function responsibleInitial(task) {
  const name = task.responsibleUser?.name || task.responsible || '';
  return name.trim().charAt(0).toLocaleUpperCase('pt-BR') || '?';
}

export function TaskDetailsPanel({ task, deleting, returnFocusRef, onClose, onDelete }) {
  if (!task) return null;
  const overdue = isTaskOverdue(task);

  return (
    <KanbanDialog
      title={`#${task.id} ${task.title}`}
      description="Detalhes da tarefa"
      size="wide"
      returnFocusRef={returnFocusRef}
      onClose={onClose}
    >
      <div className="task-detail-layout">
        <section className="task-detail-main" aria-labelledby="task-detail-information-title">
          <p className="task-detail-description">
            {task.description || 'Sem descrição cadastrada.'}
          </p>

          <section className="task-detail-section">
            <h3 id="task-detail-information-title">Informações</h3>
            <dl className="task-detail-grid">
              <div>
                <dt>Prioridade</dt>
                <dd>
                  <span
                    className={`priority-badge priority-${(task.priority || 'MEDIA').toLowerCase()}`}
                  >
                    {priorityLabels[task.priority] || task.priority || 'Média'}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Responsável</dt>
                <dd className="task-detail-responsible">
                  <span aria-hidden="true">{responsibleInitial(task)}</span>
                  {task.responsibleUser?.name || task.responsible || 'Não informado'}
                </dd>
              </div>
              <div>
                <dt>Prazo</dt>
                <dd className={overdue ? 'task-detail-deadline--overdue' : ''}>
                  {formatDate(task.deadline)}
                  {overdue && <small>Atrasada</small>}
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <span className={`status-badge status-${task.status.toLowerCase()}`}>
                    {statusLabels[task.status] || task.status}
                  </span>
                </dd>
              </div>
            </dl>
            <dl className="task-detail-secondary-grid">
              <div>
                <dt>Esforço estimado</dt>
                <dd>{task.estimatedEffort ?? 'Não informado'}</dd>
              </div>
              <div>
                <dt>Esforço realizado</dt>
                <dd>{task.actualEffort ?? 'Não informado'}</dd>
              </div>
              <div>
                <dt>Criado em</dt>
                <dd>{formatDateTime(task.createdAt)}</dd>
              </div>
            </dl>
          </section>

          <section
            className="task-detail-section task-detail-traceability"
            aria-labelledby="task-detail-traceability-title"
          >
            <h3 id="task-detail-traceability-title">Rastreabilidade</h3>
            <div className="task-detail-traceability-grid">
              <article>
                <span>Requisito</span>
                {task.requirement ? (
                  <div>
                    <strong>{formatRequirementLabel(task.requirement)}</strong>
                    <p>
                      {task.requirement.status
                        ? requirementStatusLabels[task.requirement.status] ||
                          task.requirement.status
                        : 'Status não informado'}
                    </p>
                  </div>
                ) : (
                  <p>Nenhum vínculo</p>
                )}
              </article>
              <article>
                <span>Pull request</span>
                {task.pullRequest ? (
                  <div>
                    <strong>
                      #{task.pullRequest.number} — {task.pullRequest.title}
                    </strong>
                    <p>{task.pullRequest.state || 'Status não informado'}</p>
                    {task.pullRequest.githubUrl && (
                      <a
                        href={task.pullRequest.githubUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Abrir no GitHub
                      </a>
                    )}
                  </div>
                ) : (
                  <p>Nenhum vínculo</p>
                )}
              </article>
              <article>
                <span>Commits</span>
                {task.commits?.length ? (
                  <div className="task-detail-artifact-list">
                    {task.commits.map((commit) => (
                      <div key={commit.id}>
                        <strong>{formatCommitLabel(commit)}</strong>
                        <p>
                          {commit.authorName || commit.authorUsername || 'Autor não informado'} ·{' '}
                          {formatDateTime(commit.date)}
                        </p>
                        {commit.githubUrl && (
                          <a href={commit.githubUrl} target="_blank" rel="noopener noreferrer">
                            Abrir no GitHub
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>Nenhum vínculo</p>
                )}
              </article>
              <article>
                <span>Issues</span>
                {task.issues?.length ? (
                  <div className="task-detail-artifact-list">
                    {task.issues.map((issue) => (
                      <div key={issue.id}>
                        <strong>{formatIssueLabel(issue)}</strong>
                        <p>
                          {issue.state || 'Status não informado'} ·{' '}
                          {formatIssueLabels(issue.labels)}
                        </p>
                        {issue.githubUrl && (
                          <a href={issue.githubUrl} target="_blank" rel="noopener noreferrer">
                            Abrir no GitHub
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>Nenhum vínculo</p>
                )}
              </article>
            </div>
          </section>

          <div className="task-detail-danger-zone">
            <button
              className="button button-danger"
              type="button"
              onClick={() => onDelete(task)}
              disabled={deleting}
            >
              {deleting ? 'Excluindo...' : 'Excluir tarefa'}
            </button>
          </div>
        </section>
        <TaskComments taskId={task.id} />
      </div>
    </KanbanDialog>
  );
}
