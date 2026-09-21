import { useCallback } from 'react';
import { getProjectCommits, getProjectIssues, getProjectPullRequests } from '../../github/index.js';
import { requirementsApi } from '../../requirements/index.js';
import { normalizeApiError, SearchCombobox } from '../../../shared/index.js';
import {
  linkTaskCommit,
  linkTaskIssue,
  linkTaskRequirement,
  linkTaskToPullRequest,
  unlinkTaskCommit,
  unlinkTaskFromPullRequest,
  unlinkTaskIssue,
  unlinkTaskRequirement
} from '../api/tasks.api.js';
import { CommitSuggestionsCard } from './CommitSuggestionsCard.jsx';
import { formatCommitLabel, formatIssueLabel, formatRequirementLabel } from './kanban-display.js';
import '../../../shared/styles/traceability-controls.css';
import './TaskTraceabilityEditor.css';

function artifactId(value) {
  return value?.id === undefined || value?.id === null ? null : String(value.id);
}

function uniqueById(items) {
  const seen = new Set();
  return items.filter((item) => {
    const id = artifactId(item);
    if (id === null || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function createTaskTraceabilityDraft(task) {
  return {
    requirement: task.requirement || null,
    pullRequest: task.pullRequest || null,
    commits: uniqueById(task.commits || []),
    issues: uniqueById(task.issues || [])
  };
}

export function taskTraceabilitySnapshot(value) {
  return JSON.stringify({
    requirementId: artifactId(value.requirement),
    pullRequestId: artifactId(value.pullRequest),
    commitIds: value.commits.map(artifactId).sort(),
    issueIds: value.issues.map(artifactId).sort()
  });
}

function formatPullRequestLabel(pullRequest) {
  return `#${pullRequest.number} — ${pullRequest.title}`;
}

function ArtifactSearch({
  label,
  placeholder,
  search,
  emptyMessage,
  formatLabel,
  onSelect,
  excludedIds,
  isQueryValid,
  failureMessage,
  disabled = false
}) {
  return (
    <div className="traceability-picker">
      <SearchCombobox
        label={label}
        placeholder={placeholder}
        disabled={disabled}
        emptyMessage={emptyMessage}
        searchErrorMessage={failureMessage}
        getOptionLabel={formatLabel}
        isQueryValid={isQueryValid}
        onSearch={async (query, signal) =>
          (await search(query, signal)).filter((item) => !excludedIds.has(artifactId(item)))
        }
        onSelect={onSelect}
      />
    </div>
  );
}

function SelectedItem({ children, removeLabel, onRemove, disabled = false }) {
  return (
    <div className="traceability-selected-item">
      <strong>{children}</strong>
      <button
        className="traceability-remove-button"
        type="button"
        aria-label={removeLabel}
        title={removeLabel}
        disabled={disabled}
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  );
}

export async function persistTaskTraceability(task, draft) {
  let nextTask = task;
  let successCount = 0;
  const failures = [];

  async function perform(label, operation, applyResult) {
    try {
      const result = await operation();
      nextTask = applyResult(nextTask, result);
      successCount += 1;
    } catch (requestError) {
      failures.push(
        normalizeApiError(requestError, `Não foi possível atualizar ${label}.`).message
      );
    }
  }

  if (artifactId(task.requirement) !== artifactId(draft.requirement)) {
    await perform(
      'o vínculo com o requisito',
      () =>
        draft.requirement
          ? linkTaskRequirement(task.id, draft.requirement.id)
          : unlinkTaskRequirement(task.id),
      (current, result) => result.task || { ...current, requirement: draft.requirement }
    );
  }

  if (artifactId(task.pullRequest) !== artifactId(draft.pullRequest)) {
    await perform(
      'o vínculo com o pull request',
      () =>
        draft.pullRequest
          ? linkTaskToPullRequest(task.id, draft.pullRequest.id)
          : unlinkTaskFromPullRequest(task.id),
      (current, result) => result.task || { ...current, pullRequest: draft.pullRequest }
    );
  }

  const previousCommitIds = new Set((task.commits || []).map(artifactId));
  const selectedCommitIds = new Set(draft.commits.map(artifactId));
  for (const commit of draft.commits.filter((item) => !previousCommitIds.has(artifactId(item)))) {
    await perform(
      `o commit ${formatCommitLabel(commit)}`,
      () => linkTaskCommit(task.id, commit.id),
      (current, result) => ({
        ...current,
        commits: result.commits || [...(current.commits || []), commit]
      })
    );
  }
  for (const commit of (task.commits || []).filter(
    (item) => !selectedCommitIds.has(artifactId(item))
  )) {
    await perform(
      `o commit ${formatCommitLabel(commit)}`,
      () => unlinkTaskCommit(task.id, commit.id),
      (current, result) => ({
        ...current,
        commits:
          result.commits ||
          (current.commits || []).filter((item) => artifactId(item) !== artifactId(commit))
      })
    );
  }

  const previousIssueIds = new Set((task.issues || []).map(artifactId));
  const selectedIssueIds = new Set(draft.issues.map(artifactId));
  for (const issue of draft.issues.filter((item) => !previousIssueIds.has(artifactId(item)))) {
    await perform(
      `a issue ${formatIssueLabel(issue)}`,
      () => linkTaskIssue(task.id, issue.id),
      (current, result) => ({
        ...current,
        issues: result.issues || [...(current.issues || []), issue]
      })
    );
  }
  for (const issue of (task.issues || []).filter(
    (item) => !selectedIssueIds.has(artifactId(item))
  )) {
    await perform(
      `a issue ${formatIssueLabel(issue)}`,
      () => unlinkTaskIssue(task.id, issue.id),
      (current, result) => ({
        ...current,
        issues:
          result.issues ||
          (current.issues || []).filter((item) => artifactId(item) !== artifactId(issue))
      })
    );
  }

  return { task: nextTask, successCount, failures };
}

export function TaskTraceabilityEditor({
  projectId,
  task,
  draft,
  onDraftChange,
  disabled = false,
  onSuggestionConfirmed
}) {
  const searchRequirements = useCallback(
    async (query, signal) => {
      const response = await requirementsApi.listByProject(
        projectId,
        { search: query },
        { signal }
      );
      return response.data.requirements || [];
    },
    [projectId]
  );
  const searchPullRequests = useCallback(
    async (query, signal) => {
      const response = await getProjectPullRequests(projectId, { search: query }, { signal });
      return response.pullRequests || [];
    },
    [projectId]
  );
  const searchCommits = useCallback(
    async (query, signal) => {
      const response = await getProjectCommits(projectId, { search: query }, { signal });
      return response.commits || [];
    },
    [projectId]
  );
  const searchIssues = useCallback(
    async (query, signal) => {
      const response = await getProjectIssues(projectId, { search: query }, { signal });
      return response.issues || [];
    },
    [projectId]
  );

  function confirmSuggestedCommit(commit) {
    const addCommit = (value) => ({
      ...value,
      commits: uniqueById([...value.commits, commit])
    });
    onDraftChange(addCommit);
    onSuggestionConfirmed?.(commit);
  }

  const requirementIds = new Set(draft.requirement ? [artifactId(draft.requirement)] : []);
  const pullRequestIds = new Set(draft.pullRequest ? [artifactId(draft.pullRequest)] : []);
  const commitIds = new Set(draft.commits.map(artifactId));
  const issueIds = new Set(draft.issues.map(artifactId));

  return (
    <div className="task-detail-traceability-editor">
      <div className="task-detail-traceability-editor__grid">
        <fieldset>
          <legend>Requisito vinculado</legend>
          {draft.requirement ? (
            <SelectedItem
              removeLabel="Remover requisito vinculado"
              disabled={disabled}
              onRemove={() => onDraftChange((current) => ({ ...current, requirement: null }))}
            >
              {formatRequirementLabel(draft.requirement)}
            </SelectedItem>
          ) : (
            <p className="field-help">Nenhum requisito vinculado.</p>
          )}
          <ArtifactSearch
            label="Pesquisar requisito"
            placeholder="Pesquisar requisito por título..."
            search={searchRequirements}
            emptyMessage="Nenhum requisito encontrado."
            failureMessage="Não foi possível carregar os requisitos."
            formatLabel={formatRequirementLabel}
            excludedIds={requirementIds}
            disabled={disabled}
            onSelect={(requirement) => onDraftChange((current) => ({ ...current, requirement }))}
          />
        </fieldset>

        <fieldset>
          <legend>Pull request vinculado</legend>
          {draft.pullRequest ? (
            <SelectedItem
              removeLabel="Remover pull request vinculado"
              disabled={disabled}
              onRemove={() => onDraftChange((current) => ({ ...current, pullRequest: null }))}
            >
              {formatPullRequestLabel(draft.pullRequest)}
            </SelectedItem>
          ) : (
            <p className="field-help">Nenhum pull request vinculado.</p>
          )}
          <ArtifactSearch
            label="Pesquisar pull request"
            placeholder="Pesquisar por número ou título do PR..."
            search={searchPullRequests}
            emptyMessage="Nenhum pull request encontrado."
            failureMessage="Não foi possível carregar os pull requests do projeto."
            formatLabel={formatPullRequestLabel}
            excludedIds={pullRequestIds}
            isQueryValid={(query) => query.length >= 2 || /\d/.test(query)}
            disabled={disabled}
            onSelect={(pullRequest) => onDraftChange((current) => ({ ...current, pullRequest }))}
          />
        </fieldset>

        <fieldset>
          <legend>Commits vinculados ({draft.commits.length})</legend>
          {draft.commits.length ? (
            <div className="traceability-selected-list">
              {draft.commits.map((commit) => (
                <SelectedItem
                  key={commit.id}
                  removeLabel={`Remover commit vinculado ${formatCommitLabel(commit)}`}
                  disabled={disabled}
                  onRemove={() =>
                    onDraftChange((current) => ({
                      ...current,
                      commits: current.commits.filter(
                        (item) => artifactId(item) !== artifactId(commit)
                      )
                    }))
                  }
                >
                  {formatCommitLabel(commit)}
                </SelectedItem>
              ))}
            </div>
          ) : (
            <p className="field-help">Nenhum commit vinculado.</p>
          )}
          <ArtifactSearch
            label="Pesquisar commits"
            placeholder="Pesquisar por SHA ou mensagem..."
            search={searchCommits}
            emptyMessage="Nenhum commit encontrado."
            failureMessage="Não foi possível carregar os commits do projeto."
            formatLabel={formatCommitLabel}
            excludedIds={commitIds}
            disabled={disabled}
            onSelect={(commit) => {
              onDraftChange((current) => ({
                ...current,
                commits: uniqueById([...current.commits, commit])
              }));
            }}
          />
          <CommitSuggestionsCard
            projectId={projectId}
            taskId={task.id}
            disabled={disabled}
            onConfirmed={confirmSuggestedCommit}
          />
        </fieldset>

        <fieldset>
          <legend>Issues vinculadas ({draft.issues.length})</legend>
          {draft.issues.length ? (
            <div className="traceability-selected-list">
              {draft.issues.map((issue) => (
                <SelectedItem
                  key={issue.id}
                  removeLabel={`Remover issue vinculada ${formatIssueLabel(issue)}`}
                  disabled={disabled}
                  onRemove={() =>
                    onDraftChange((current) => ({
                      ...current,
                      issues: current.issues.filter(
                        (item) => artifactId(item) !== artifactId(issue)
                      )
                    }))
                  }
                >
                  {formatIssueLabel(issue)}
                </SelectedItem>
              ))}
            </div>
          ) : (
            <p className="field-help">Nenhuma issue vinculada.</p>
          )}
          <ArtifactSearch
            label="Pesquisar issues"
            placeholder="Pesquisar issue por número ou título..."
            search={searchIssues}
            emptyMessage="Nenhuma issue encontrada."
            failureMessage="Não foi possível carregar as issues do projeto."
            formatLabel={formatIssueLabel}
            excludedIds={issueIds}
            isQueryValid={(query) => query.length >= 2 || /\d/.test(query)}
            disabled={disabled}
            onSelect={(issue) => {
              onDraftChange((current) => ({
                ...current,
                issues: uniqueById([...current.issues, issue])
              }));
            }}
          />
        </fieldset>
      </div>
    </div>
  );
}
