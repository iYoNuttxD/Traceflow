import { EntityRow } from '../../../shared/index.js';
import {
  formatCommitLabel,
  formatDateTime,
  formatIssueLabel,
  formatIssueLabels,
  formatRequirementLabel,
  requirementStatusLabels
} from './kanban-display.js';
import {
  ArtifactCategory,
  GithubExternalAction,
  TaskTraceabilityGrid
} from './TaskDetailsLayout.jsx';

export function TaskTraceability({ task, projectId, onNavigate }) {
  return (
    <TaskTraceabilityGrid>
      <ArtifactCategory label="Requisito" count={task.requirement ? 1 : 0}>
        {task.requirement ? (
          <EntityRow
            identity={task.requirement.id ? `REQ-${task.requirement.id}` : 'Requisito'}
            title={formatRequirementLabel(task.requirement)}
            disabled={!projectId}
            to={
              projectId
                ? `/projects/${projectId}/requirements?requirement=${task.requirement.id}`
                : undefined
            }
            onClick={onNavigate}
          >
            <span>
              {task.requirement.status
                ? requirementStatusLabels[task.requirement.status] || task.requirement.status
                : 'Status não informado'}
            </span>
          </EntityRow>
        ) : (
          <p>Nenhum vínculo</p>
        )}
      </ArtifactCategory>

      <ArtifactCategory label="Pull request" count={task.pullRequest ? 1 : 0}>
        {task.pullRequest ? (
          <div>
            <strong>
              #{task.pullRequest.number} — {task.pullRequest.title}
            </strong>
            <p>{task.pullRequest.state || 'Status não informado'}</p>
            {task.pullRequest.githubUrl && (
              <GithubExternalAction href={task.pullRequest.githubUrl} />
            )}
          </div>
        ) : (
          <p>Nenhum vínculo</p>
        )}
      </ArtifactCategory>

      <ArtifactCategory label="Commits" count={task.commits?.length || 0}>
        {task.commits?.length ? (
          <div className="task-detail-artifact-list">
            {task.commits.map((commit) => (
              <div key={commit.id}>
                <strong>{formatCommitLabel(commit)}</strong>
                <p>
                  {commit.authorName || commit.authorUsername || 'Autor não informado'} ·{' '}
                  {formatDateTime(commit.date)}
                </p>
                {commit.githubUrl && <GithubExternalAction href={commit.githubUrl} />}
              </div>
            ))}
          </div>
        ) : (
          <p>Nenhum vínculo</p>
        )}
      </ArtifactCategory>

      <ArtifactCategory label="Issues" count={task.issues?.length || 0}>
        {task.issues?.length ? (
          <div className="task-detail-artifact-list">
            {task.issues.map((issue) => (
              <div key={issue.id}>
                <strong>{formatIssueLabel(issue)}</strong>
                <p>
                  {issue.state || 'Status não informado'} · {formatIssueLabels(issue.labels)}
                </p>
                {issue.githubUrl && <GithubExternalAction href={issue.githubUrl} />}
              </div>
            ))}
          </div>
        ) : (
          <p>Nenhum vínculo</p>
        )}
      </ArtifactCategory>
    </TaskTraceabilityGrid>
  );
}
