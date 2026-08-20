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

export function TaskDetailsPanel({
  task,
  deleting,
  onClose,
  onDelete,
  onUnlinkRequirement,
  onUnlinkPullRequest,
  onUnlinkCommit,
  onUnlinkIssue
}) {
  if (!task) return null;

  return (
    <div className="task-detail-overlay" role="presentation" onClick={onClose}>
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
            <h2 id="task-detail-title">{task.title}</h2>
          </div>
          <div className="task-detail-header-actions">
            <button
              className="button button-danger"
              type="button"
              onClick={() => onDelete(task)}
              disabled={deleting}
            >
              {deleting ? 'Excluindo...' : 'Excluir'}
            </button>
            <button className="text-button" type="button" onClick={onClose}>
              Fechar
            </button>
          </div>
        </div>
        <p className="task-detail-description">{task.description || 'Sem descrição cadastrada.'}</p>
        <dl className="task-detail-grid">
          <div>
            <dt>Prioridade</dt>
            <dd>{priorityLabels[task.priority] || task.priority}</dd>
          </div>
          <div>
            <dt>Responsável</dt>
            <dd>{task.responsibleUser?.name || task.responsible || 'Não informado'}</dd>
          </div>
          <div>
            <dt>Prazo</dt>
            <dd>{formatDate(task.deadline)}</dd>
          </div>
          <div>
            <dt>Status atual</dt>
            <dd>{statusLabels[task.status] || task.status}</dd>
          </div>
          <div>
            <dt>Esforço estimado</dt>
            <dd>{task.estimatedEffort ?? 'Não informado'}</dd>
          </div>
          <div>
            <dt>Esforço realizado</dt>
            <dd>{task.actualEffort ?? 'Não informado'}</dd>
          </div>
          <div>
            <dt>Data de criação</dt>
            <dd>{formatDateTime(task.createdAt)}</dd>
          </div>
        </dl>
        <div className="task-detail-traceability">
          <span>Rastreabilidade</span>
          <div className="task-detail-traceability-section">
            <strong>Requisito</strong>
            {task.requirement ? (
              <div className="task-detail-traceability-item">
                <div>
                  <strong>{formatRequirementLabel(task.requirement)}</strong>
                  <p>
                    Status:{' '}
                    {task.requirement.status
                      ? requirementStatusLabels[task.requirement.status] || task.requirement.status
                      : 'não informado'}
                  </p>
                </div>
                <button
                  className="traceability-remove-button"
                  type="button"
                  onClick={() => onUnlinkRequirement(task.id)}
                  aria-label="Remover requisito vinculado"
                  title="Remover requisito"
                >
                  ×
                </button>
              </div>
            ) : (
              <p>Sem requisito vinculado.</p>
            )}
          </div>
          <div className="task-detail-traceability-section">
            <strong>Pull request</strong>
            {task.pullRequest ? (
              <div className="task-detail-traceability-item">
                <div>
                  <strong>
                    #{task.pullRequest.number} — {task.pullRequest.title}
                  </strong>
                  <p>Status: {task.pullRequest.state || 'não informado'}</p>
                  <p>Autor: {task.pullRequest.authorUsername || 'não informado'}</p>
                  {task.pullRequest.githubUrl && (
                    <a href={task.pullRequest.githubUrl} target="_blank" rel="noopener noreferrer">
                      Abrir no GitHub
                    </a>
                  )}
                </div>
                <button
                  className="traceability-remove-button"
                  type="button"
                  onClick={() => onUnlinkPullRequest(task.id)}
                  aria-label="Remover pull request vinculado"
                  title="Remover pull request"
                >
                  ×
                </button>
              </div>
            ) : (
              <p>Sem PR vinculado.</p>
            )}
          </div>
          <div className="task-detail-traceability-section">
            <strong>Commits</strong>
            {task.commits?.length ? (
              <div className="task-detail-commit-list">
                {task.commits.map((commit) => (
                  <div className="task-detail-traceability-item" key={commit.id}>
                    <div>
                      <strong>{formatCommitLabel(commit)}</strong>
                      <p>Autor: {commit.authorName || commit.authorUsername || 'não informado'}</p>
                      <p>Data: {formatDateTime(commit.date)}</p>
                      <p>
                        Branches:{' '}
                        {commit.branches?.length ? commit.branches.join(', ') : 'não informadas'}
                      </p>
                      {commit.githubUrl && (
                        <a href={commit.githubUrl} target="_blank" rel="noopener noreferrer">
                          Abrir no GitHub
                        </a>
                      )}
                    </div>
                    <button
                      className="traceability-remove-button"
                      type="button"
                      onClick={() => onUnlinkCommit(task.id, commit.id)}
                      aria-label="Remover commit vinculado"
                      title="Remover commit"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p>Sem commits vinculados.</p>
            )}
          </div>
          <div className="task-detail-traceability-section">
            <strong>Issues</strong>
            {task.issues?.length ? (
              <div className="task-detail-commit-list">
                {task.issues.map((issue) => (
                  <div className="task-detail-traceability-item" key={issue.id}>
                    <div>
                      <strong>{formatIssueLabel(issue)}</strong>
                      <p>Status: {issue.state || 'não informado'}</p>
                      <p>Autor: {issue.authorUsername || 'não informado'}</p>
                      <p>Labels: {formatIssueLabels(issue.labels)}</p>
                      {issue.githubUrl && (
                        <a href={issue.githubUrl} target="_blank" rel="noopener noreferrer">
                          Abrir no GitHub
                        </a>
                      )}
                    </div>
                    <button
                      className="traceability-remove-button"
                      type="button"
                      onClick={() => onUnlinkIssue(task.id, issue.id)}
                      aria-label="Remover issue vinculada"
                      title="Remover issue"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p>Sem issues vinculadas.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
