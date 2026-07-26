import { Card } from '../../../shared/index.js';

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

function formatDate(value) {
  return value
    ? new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
    : 'Não informado';
}

function formatDateTime(value) {
  return new Date(value).toLocaleString('pt-BR');
}

function formatPullRequest(pullRequest) {
  return `#${pullRequest.number} — ${pullRequest.title}`;
}

function formatCommit(commit) {
  const shortHash = commit.shortHash || commit.hash?.slice(0, 7) || `#${commit.id}`;
  return `${shortHash} — ${commit.message || 'Sem mensagem'}`;
}

function formatIssue(issue) {
  return `#${issue.number} — ${issue.title}`;
}

function TraceabilityItem({ children, href, removeLabel, removeTitle, onRemove }) {
  return (
    <div className="task-traceability-item">
      {href ? <a className="task-pr-link" href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>}
      <button className="traceability-remove-button" type="button" onClick={onRemove} aria-label={removeLabel} title={removeTitle}>×</button>
    </div>
  );
}

function TaskListItem({ task, deleting, onEdit, onDelete, onUnlinkRequirement, onUnlinkPullRequest, onUnlinkCommit, onUnlinkIssue }) {
  return (
    <article className="task-item">
      <div className="task-item-header">
        <div>
          <span className={`priority-badge priority-${task.priority.toLowerCase()}`}>{priorityLabels[task.priority]}</span>
          <h3>{task.title}</h3>
        </div>
        <span className={`status-badge status-${task.status.toLowerCase()}`}>{statusLabels[task.status]}</span>
      </div>
      <p>{task.description || 'Sem descrição cadastrada.'}</p>
      <dl className="task-details">
        <div><dt>Responsável</dt><dd>{task.responsibleUser?.name || task.responsible || 'Não informado'}</dd></div>
        <div><dt>Prazo</dt><dd>{formatDate(task.deadline)}</dd></div>
        <div><dt>Esforço estimado</dt><dd>{task.estimatedEffort ?? 'Não informado'}</dd></div>
        <div><dt>Esforço realizado</dt><dd>{task.actualEffort ?? 'Não informado'}</dd></div>
        <div><dt>Criada em</dt><dd>{formatDateTime(task.createdAt)}</dd></div>
      </dl>
      <div className="task-pr-card">
        <span>Rastreabilidade</span>
        <div className="task-traceability-group">
          <strong>Requisito</strong>
          {task.requirement ? (
            <TraceabilityItem removeLabel="Remover requisito vinculado" removeTitle="Remover requisito" onRemove={() => onUnlinkRequirement(task.id)}>
              {task.requirement.title}
            </TraceabilityItem>
          ) : <p className="task-pr-meta">Sem requisito vinculado.</p>}
        </div>
        <div className="task-traceability-group">
          <strong>Pull request</strong>
          {task.pullRequest ? (
            <TraceabilityItem href={task.pullRequest.githubUrl} removeLabel="Remover pull request vinculado" removeTitle="Remover pull request" onRemove={() => onUnlinkPullRequest(task.id)}>
              {formatPullRequest(task.pullRequest)}
            </TraceabilityItem>
          ) : <p className="task-pr-meta">Sem PR vinculado.</p>}
        </div>
        <div className="task-traceability-group">
          <strong>Commits</strong>
          {task.commits?.length ? (
            <div className="task-traceability-list">
              {task.commits.map((commit) => (
                <TraceabilityItem key={commit.id} href={commit.githubUrl} removeLabel="Remover commit vinculado" removeTitle="Remover commit" onRemove={() => onUnlinkCommit(task.id, commit.id)}>
                  {formatCommit(commit)}
                </TraceabilityItem>
              ))}
            </div>
          ) : <p className="task-pr-meta">Sem commits vinculados.</p>}
        </div>
        <div className="task-traceability-group">
          <strong>Issues</strong>
          {task.issues?.length ? (
            <div className="task-traceability-list">
              {task.issues.map((issue) => (
                <TraceabilityItem key={issue.id} href={issue.githubUrl} removeLabel="Remover issue vinculada" removeTitle="Remover issue" onRemove={() => onUnlinkIssue(task.id, issue.id)}>
                  {formatIssue(issue)}
                </TraceabilityItem>
              ))}
            </div>
          ) : <p className="task-pr-meta">Sem issues vinculadas.</p>}
        </div>
      </div>
      <div className="task-actions">
        <button className="button button-secondary" type="button" onClick={() => onEdit(task)}>Editar</button>
        <button className="button button-danger" type="button" onClick={() => onDelete(task)} disabled={deleting}>
          {deleting ? 'Excluindo...' : 'Excluir'}
        </button>
      </div>
    </article>
  );
}

export function TaskList({ tasks, deletingTaskId, onEdit, onDelete, onUnlinkRequirement, onUnlinkPullRequest, onUnlinkCommit, onUnlinkIssue }) {
  return (
    <section className="tasks-list-section">
      <Card title="Tarefas cadastradas">
        {tasks.length === 0 ? <p className="empty-state">Nenhuma tarefa cadastrada ainda.</p> : (
          <div className="task-list tasks-list-grid">
            {tasks.map((task) => (
              <TaskListItem
                key={task.id}
                task={task}
                deleting={deletingTaskId === task.id}
                onEdit={onEdit}
                onDelete={onDelete}
                onUnlinkRequirement={onUnlinkRequirement}
                onUnlinkPullRequest={onUnlinkPullRequest}
                onUnlinkCommit={onUnlinkCommit}
                onUnlinkIssue={onUnlinkIssue}
              />
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}
