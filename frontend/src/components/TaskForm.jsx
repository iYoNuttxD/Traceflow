import { useEffect, useState } from 'react';

export const emptyTaskForm = {
  title: '',
  description: '',
  priority: 'MEDIA',
  responsible: '',
  status: 'A_FAZER',
  deadline: '',
  estimatedEffort: '',
  actualEffort: '',
  pullRequestId: '',
  commitIds: [],
  issueIds: []
};

export function taskToFormData(task) {
  return {
    title: task.title || '',
    description: task.description || '',
    priority: task.priority || 'MEDIA',
    responsible: task.responsible || '',
    status: task.status || 'A_FAZER',
    deadline: task.deadline ? task.deadline.slice(0, 10) : '',
    estimatedEffort: task.estimatedEffort ?? '',
    actualEffort: task.actualEffort ?? '',
    pullRequestId: task.pullRequestId ? String(task.pullRequestId) : '',
    commitIds: (task.commits || []).map((commit) => String(commit.id)),
    issueIds: (task.issues || []).map((issue) => String(issue.id))
  };
}

function normalizeNumberField(value) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return String(value);
  }

  return parsedValue;
}

function formatMemberName(member) {
  return member.name || member.email || 'Membro sem nome';
}

function formatPullRequestLabel(pullRequest) {
  if (!pullRequest) {
    return 'Pull request selecionado';
  }

  return `#${pullRequest.number} — ${pullRequest.title}`;
}

function formatCommitLabel(commit) {
  if (!commit) {
    return 'Commit selecionado';
  }

  const shortHash = commit.shortHash || commit.hash?.slice(0, 7) || `#${commit.id}`;

  return `${shortHash} — ${commit.message || 'Sem mensagem'}`;
}

function formatIssueLabel(issue) {
  if (!issue) {
    return 'Issue selecionada';
  }

  return `#${issue.number} — ${issue.title}`;
}

function normalizeText(value) {
  return String(value || '').trim();
}

export function taskFormToPayload(formData, editing = false) {
  const payload = {
    ...formData,
    deadline: formData.deadline || null,
    estimatedEffort: normalizeNumberField(formData.estimatedEffort)
  };

  if (editing) {
    payload.actualEffort = normalizeNumberField(formData.actualEffort);
  } else {
    delete payload.actualEffort;
  }

  delete payload.pullRequestId;
  delete payload.commitIds;
  delete payload.issueIds;

  return payload;
}

export function TaskForm({
  formData,
  onChange,
  onSubmit,
  onCancel,
  submitting,
  editing,
  pullRequests = [],
  projectMembers = [],
  selectedPullRequest = null,
  selectedCommits = [],
  selectedIssues = [],
  commitResults = [],
  issueResults = [],
  onPullRequestSearch,
  onCommitSearch,
  onIssueSearch,
  onSelectPullRequest,
  onClearPullRequest,
  onSelectCommit,
  onRemoveCommit,
  onSelectIssue,
  onRemoveIssue
}) {
  const [pullRequestSearch, setPullRequestSearch] = useState('');
  const [commitSearch, setCommitSearch] = useState('');
  const [issueSearch, setIssueSearch] = useState('');
  const hasMembers = projectMembers.length > 0;
  const normalizedResponsible = normalizeText(formData.responsible);
  const hasLegacyResponsible =
    normalizedResponsible &&
    !projectMembers.some(
      (member) => normalizeText(formatMemberName(member)) === normalizedResponsible
    );
  const linkedCommitIds = new Set((formData.commitIds || []).map(String));
  const linkedIssueIds = new Set((formData.issueIds || []).map(String));
  const normalizedPullRequestSearch = normalizeText(pullRequestSearch).toLowerCase();
  const pullRequestNumericSearch = normalizedPullRequestSearch.replace(/\D/g, '');
  const normalizedCommitSearch = normalizeText(commitSearch).toLowerCase();
  const normalizedIssueSearch = normalizeText(issueSearch).toLowerCase();
  const issueNumericSearch = normalizedIssueSearch.replace(/\D/g, '');
  const availableCommitResults = commitResults.filter(
    (commit) =>
      !linkedCommitIds.has(String(commit.id)) &&
      (commit.hash?.toLowerCase().includes(normalizedCommitSearch) ||
        commit.shortHash?.toLowerCase().includes(normalizedCommitSearch) ||
        commit.message?.toLowerCase().includes(normalizedCommitSearch))
  );
  const availablePullRequests = pullRequests.filter((pullRequest) => {
    if (String(pullRequest.id) === String(formData.pullRequestId)) {
      return false;
    }

    const matchesNumber =
      pullRequestNumericSearch &&
      Number(pullRequest.number) === Number(pullRequestNumericSearch);
    const matchesTitle = pullRequest.title
      ?.toLowerCase()
      .includes(normalizedPullRequestSearch);

    return Boolean(matchesNumber || matchesTitle);
  });
  const availableIssueResults = issueResults.filter((issue) => {
    if (linkedIssueIds.has(String(issue.id))) {
      return false;
    }

    const matchesNumber =
      issueNumericSearch && Number(issue.number) === Number(issueNumericSearch);
    const matchesTitle = issue.title?.toLowerCase().includes(normalizedIssueSearch);

    return Boolean(matchesNumber || matchesTitle);
  });

  useEffect(() => {
    const query = pullRequestSearch.trim();
    const hasNumericSearch = /\d/.test(query);

    if ((!hasNumericSearch && query.length < 2) || !onPullRequestSearch) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      onPullRequestSearch(query);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [onPullRequestSearch, pullRequestSearch]);

  useEffect(() => {
    const query = commitSearch.trim();

    if (query.length < 2 || !onCommitSearch) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      onCommitSearch(query);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [commitSearch, onCommitSearch]);

  useEffect(() => {
    const query = issueSearch.trim();
    const hasNumericSearch = /\d/.test(query);

    if ((!hasNumericSearch && query.length < 2) || !onIssueSearch) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      onIssueSearch(query);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [issueSearch, onIssueSearch]);

  function handleChange(event) {
    onChange(event.target.name, event.target.value);
  }

  function handleSelectPullRequest(pullRequest) {
    onSelectPullRequest?.(pullRequest);
    setPullRequestSearch('');
  }

  function handleSelectCommit(commit) {
    onSelectCommit?.(commit);
    setCommitSearch('');
  }

  function handleSelectIssue(issue) {
    onSelectIssue?.(issue);
    setIssueSearch('');
  }

  return (
    <form className="task-form" onSubmit={onSubmit}>
      <label className="field field-full">
        <span>Título da tarefa</span>
        <input
          name="title"
          value={formData.title}
          onChange={handleChange}
          required
          placeholder="Ex.: Implementar cadastro de tarefas"
        />
      </label>

      <label className="field field-full">
        <span>Descrição</span>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
          rows="4"
          placeholder="Descreva o trabalho que deve ser realizado."
        />
      </label>

      <label className="field">
        <span>Prioridade</span>
        <select name="priority" value={formData.priority} onChange={handleChange}>
          <option value="BAIXA">Baixa</option>
          <option value="MEDIA">Média</option>
          <option value="ALTA">Alta</option>
          <option value="CRITICA">Crítica</option>
        </select>
      </label>

      <label className="field">
        <span>Responsável</span>
        <select
          name="responsible"
          value={formData.responsible}
          onChange={handleChange}
          disabled={!hasMembers && !hasLegacyResponsible}
        >
          <option value="">
            {hasMembers
              ? 'Selecione um responsável'
              : 'Nenhum membro cadastrado'}
          </option>
          {hasLegacyResponsible && (
            <option value={formData.responsible}>
              Responsável atual: {formData.responsible}
            </option>
          )}
          {projectMembers.map((member) => (
            <option key={member.id} value={formatMemberName(member)}>
              {formatMemberName(member)}
            </option>
          ))}
        </select>
        {!hasMembers && (
          <small className="field-help">
            Cadastre membros no projeto para atribuir responsáveis às tarefas.
          </small>
        )}
      </label>

      <label className="field">
        <span>Status</span>
        <select name="status" value={formData.status} onChange={handleChange}>
          <option value="A_FAZER">A Fazer</option>
          <option value="EM_ANDAMENTO">Em Andamento</option>
          <option value="CONCLUIDO">Concluído</option>
        </select>
      </label>

      <label className="field">
        <span>Prazo</span>
        <input
          type="date"
          name="deadline"
          value={formData.deadline}
          onChange={handleChange}
        />
      </label>

      <label className="field">
        <span>Esforço estimado</span>
        <input
          type="number"
          min="0"
          step="1"
          name="estimatedEffort"
          value={formData.estimatedEffort}
          onChange={handleChange}
          placeholder="Horas"
        />
      </label>

      {editing && (
        <label className="field">
          <span>Esforço realizado</span>
          <input
            type="number"
            min="0"
            step="1"
            name="actualEffort"
            value={formData.actualEffort}
            onChange={handleChange}
            placeholder="Horas"
          />
        </label>
      )}

      <section className="task-traceability-form field-full">
        <div>
          <span className="form-section-title">Rastreabilidade</span>
          <p className="field-help">
            Vincule a tarefa aos artefatos importados do GitHub.
          </p>
        </div>

        <div className="traceability-picker">
          <span>Pull request vinculado</span>
          {formData.pullRequestId ? (
            <div className="traceability-selected-item">
              <strong>{formatPullRequestLabel(selectedPullRequest)}</strong>
              <button
                className="traceability-remove-button"
                type="button"
                onClick={() => {
                  onClearPullRequest?.();
                  setPullRequestSearch('');
                }}
                aria-label="Remover pull request vinculado"
                title="Remover pull request"
              >
                ×
              </button>
            </div>
          ) : null}
          <input
            type="search"
            value={pullRequestSearch}
            onChange={(event) => setPullRequestSearch(event.target.value)}
            placeholder="Pesquisar por número ou título do PR..."
          />
          {pullRequestSearch.trim().length >= 2 || /\d/.test(pullRequestSearch) ? (
            <div className="traceability-results">
              {availablePullRequests.length === 0 ? (
                <p>Nenhum pull request encontrado.</p>
              ) : (
                availablePullRequests.map((pullRequest) => (
                  <button
                    key={pullRequest.id}
                    type="button"
                    onClick={() => handleSelectPullRequest(pullRequest)}
                  >
                    {formatPullRequestLabel(pullRequest)}
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>

        <div className="traceability-picker">
          <span>Commits vinculados</span>
          {selectedCommits.length > 0 && (
            <div className="traceability-selected-list">
              {selectedCommits.map((commit) => (
                <div className="traceability-selected-item" key={commit.id}>
                  <strong>{formatCommitLabel(commit)}</strong>
                  <button
                    className="traceability-remove-button"
                    type="button"
                    onClick={() => onRemoveCommit?.(commit.id)}
                    aria-label="Remover commit vinculado"
                    title="Remover commit"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <input
            type="search"
            value={commitSearch}
            onChange={(event) => setCommitSearch(event.target.value)}
            placeholder="Pesquisar commit por SHA ou mensagem..."
          />
          {commitSearch.trim().length >= 2 && (
            <div className="traceability-results">
              {availableCommitResults.length === 0 ? (
                <p>Nenhum commit encontrado.</p>
              ) : (
                availableCommitResults.map((commit) => (
                  <button
                    key={commit.id}
                    type="button"
                    onClick={() => handleSelectCommit(commit)}
                  >
                    {formatCommitLabel(commit)}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="traceability-picker">
          <span>Issues vinculadas</span>
          {selectedIssues.length > 0 && (
            <div className="traceability-selected-list">
              {selectedIssues.map((issue) => (
                <div className="traceability-selected-item" key={issue.id}>
                  <strong>{formatIssueLabel(issue)}</strong>
                  <button
                    className="traceability-remove-button"
                    type="button"
                    onClick={() => onRemoveIssue?.(issue.id)}
                    aria-label="Remover issue vinculada"
                    title="Remover issue"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <input
            type="search"
            value={issueSearch}
            onChange={(event) => setIssueSearch(event.target.value)}
            placeholder="Pesquisar issue por número ou título..."
          />
          {issueSearch.trim().length >= 2 || /\d/.test(issueSearch) ? (
            <div className="traceability-results">
              {availableIssueResults.length === 0 ? (
                <p>Nenhuma issue encontrada.</p>
              ) : (
                availableIssueResults.map((issue) => (
                  <button
                    key={issue.id}
                    type="button"
                    onClick={() => handleSelectIssue(issue)}
                  >
                    {formatIssueLabel(issue)}
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
      </section>

      <div className="form-actions field-full">
        {editing && (
          <button className="button button-secondary" type="button" onClick={onCancel}>
            Cancelar edição
          </button>
        )}
        <button className="button button-primary" type="submit" disabled={submitting}>
          {submitting
            ? 'Salvando...'
            : editing
              ? 'Salvar alterações'
              : 'Cadastrar tarefa'}
        </button>
      </div>
    </form>
  );
}
