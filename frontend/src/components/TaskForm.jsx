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
  commitIds: []
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
    commitIds: (task.commits || []).map((commit) => String(commit.id))
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
  commitResults = [],
  onPullRequestSearch,
  onCommitSearch,
  onSelectPullRequest,
  onClearPullRequest,
  onSelectCommit,
  onRemoveCommit
}) {
  const [pullRequestSearch, setPullRequestSearch] = useState('');
  const [commitSearch, setCommitSearch] = useState('');
  const hasMembers = projectMembers.length > 0;
  const normalizedResponsible = normalizeText(formData.responsible);
  const hasLegacyResponsible =
    normalizedResponsible &&
    !projectMembers.some(
      (member) => normalizeText(formatMemberName(member)) === normalizedResponsible
    );
  const linkedCommitIds = new Set((formData.commitIds || []).map(String));
  const normalizedPullRequestSearch = normalizeText(pullRequestSearch).toLowerCase();
  const normalizedCommitSearch = normalizeText(commitSearch).toLowerCase();
  const availableCommitResults = commitResults.filter(
    (commit) =>
      !linkedCommitIds.has(String(commit.id)) &&
      (commit.hash?.toLowerCase().includes(normalizedCommitSearch) ||
        commit.shortHash?.toLowerCase().includes(normalizedCommitSearch) ||
        commit.message?.toLowerCase().includes(normalizedCommitSearch))
  );
  const availablePullRequests = pullRequests.filter(
    (pullRequest) =>
      String(pullRequest.id) !== String(formData.pullRequestId) &&
      (`${pullRequest.number}`.includes(normalizedPullRequestSearch) ||
        pullRequest.title?.toLowerCase().includes(normalizedPullRequestSearch))
  );

  useEffect(() => {
    const query = pullRequestSearch.trim();

    if (query.length < 2 || !onPullRequestSearch) {
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
              >
                Remover
              </button>
            </div>
          ) : null}
          <input
            type="search"
            value={pullRequestSearch}
            onChange={(event) => setPullRequestSearch(event.target.value)}
            placeholder="Pesquisar por número ou título do PR..."
          />
          {pullRequestSearch.trim().length >= 2 && (
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
          )}
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
                  >
                    Remover
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
