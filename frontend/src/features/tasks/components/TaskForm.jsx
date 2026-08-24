import { useEffect, useRef, useState } from 'react';
import { CommitSuggestionsCard } from './CommitSuggestionsCard.jsx';

export const emptyTaskForm = {
  title: '',
  description: '',
  priority: 'MEDIA',
  responsible: '',
  responsibleUserId: '',
  deadline: '',
  estimatedEffort: '',
  actualEffort: '',
  requirementId: '',
  sprintId: '',
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
    responsibleUserId: task.responsibleUserId ? String(task.responsibleUserId) : '',
    deadline: task.deadline ? task.deadline.slice(0, 10) : '',
    estimatedEffort: task.estimatedEffort ?? '',
    actualEffort: task.actualEffort ?? '',
    requirementId: task.requirementId ? String(task.requirementId) : '',
    sprintId: task.sprintId ? String(task.sprintId) : '',
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
  const user = member.user || member;
  return user.name || user.email || 'Membro sem nome';
}

function memberUserId(member) {
  return member.user?.id || member.userId || member.id;
}

function formatPullRequestLabel(pullRequest) {
  if (!pullRequest) {
    return 'Pull request selecionado';
  }

  return `#${pullRequest.number} — ${pullRequest.title}`;
}

function formatRequirementLabel(requirement) {
  if (!requirement) {
    return 'Requisito selecionado';
  }

  return `${requirement.title}`;
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
  delete payload.requirementId;
  // A associação com sprint tem endpoint próprio: ela cria a participação
  // histórica (RF35), o que o CRUD de tarefa não faz. Mandá-la no corpo aqui
  // seria rejeitado pelo schema estrito do backend.
  delete payload.sprintId;
  delete payload.status;
  delete payload.commitIds;
  delete payload.issueIds;
  delete payload.responsible;
  payload.responsibleUserId = formData.responsibleUserId
    ? Number(formData.responsibleUserId)
    : null;

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
  requirements = [],
  sprints = [],
  selectedRequirement = null,
  selectedPullRequest = null,
  selectedCommits = [],
  selectedIssues = [],
  commitResults = [],
  issueResults = [],
  onRequirementSearch,
  onPullRequestSearch,
  onCommitSearch,
  onCommitSearchClear,
  onIssueSearch,
  onSelectRequirement,
  onClearRequirement,
  onSelectPullRequest,
  onClearPullRequest,
  onSelectCommit,
  onRemoveCommit,
  onSuggestionConfirmed,
  projectId,
  taskId,
  onSelectIssue,
  onRemoveIssue
}) {
  const [requirementSearch, setRequirementSearch] = useState('');
  const [pullRequestSearch, setPullRequestSearch] = useState('');
  const [commitSearch, setCommitSearch] = useState('');
  const [issueSearch, setIssueSearch] = useState('');
  const commitSearchInputRef = useRef(null);
  const activeMembers = projectMembers.filter(
    (member) => member.isActive !== false && member.user?.isActive !== false
  );
  const hasMembers = activeMembers.length > 0;
  const normalizedResponsible = normalizeText(formData.responsible);
  const hasLegacyResponsible = normalizedResponsible && !formData.responsibleUserId;
  const linkedCommitIds = new Set((formData.commitIds || []).map(String));
  const linkedIssueIds = new Set((formData.issueIds || []).map(String));
  const normalizedRequirementSearch = normalizeText(requirementSearch).toLowerCase();
  const normalizedPullRequestSearch = normalizeText(pullRequestSearch).toLowerCase();
  const pullRequestNumericSearch = normalizedPullRequestSearch.replace(/\D/g, '');
  const normalizedCommitSearch = normalizeText(commitSearch).toLowerCase();
  const normalizedIssueSearch = normalizeText(issueSearch).toLowerCase();
  const issueNumericSearch = normalizedIssueSearch.replace(/\D/g, '');
  const availableRequirements = requirements.filter((requirement) => {
    if (String(requirement.id) === String(formData.requirementId)) {
      return false;
    }

    const matchesTitle = requirement.title?.toLowerCase().includes(normalizedRequirementSearch);
    const matchesType = requirement.type?.toLowerCase().includes(normalizedRequirementSearch);
    const matchesStatus = requirement.status?.toLowerCase().includes(normalizedRequirementSearch);

    return Boolean(matchesTitle || matchesType || matchesStatus);
  });
  const seenCommitKeys = new Set();
  const availableCommitResults = commitResults
    .filter((commit) => {
      const idKey = `id:${commit.id}`;
      const hashKey = commit.hash ? `hash:${commit.hash.toLowerCase()}` : null;
      if (
        linkedCommitIds.has(String(commit.id)) ||
        seenCommitKeys.has(idKey) ||
        (hashKey && seenCommitKeys.has(hashKey))
      ) {
        return false;
      }
      const matches =
        commit.hash?.toLowerCase().includes(normalizedCommitSearch) ||
        commit.shortHash?.toLowerCase().includes(normalizedCommitSearch) ||
        commit.message?.toLowerCase().includes(normalizedCommitSearch);
      if (matches) {
        seenCommitKeys.add(idKey);
        if (hashKey) seenCommitKeys.add(hashKey);
      }
      return Boolean(matches);
    })
    .slice(0, 20);
  const availablePullRequests = pullRequests.filter((pullRequest) => {
    if (String(pullRequest.id) === String(formData.pullRequestId)) {
      return false;
    }

    const matchesNumber =
      pullRequestNumericSearch && Number(pullRequest.number) === Number(pullRequestNumericSearch);
    const matchesTitle = pullRequest.title?.toLowerCase().includes(normalizedPullRequestSearch);

    return Boolean(matchesNumber || matchesTitle);
  });
  const availableIssueResults = issueResults.filter((issue) => {
    if (linkedIssueIds.has(String(issue.id))) {
      return false;
    }

    const matchesNumber = issueNumericSearch && Number(issue.number) === Number(issueNumericSearch);
    const matchesTitle = issue.title?.toLowerCase().includes(normalizedIssueSearch);

    return Boolean(matchesNumber || matchesTitle);
  });

  useEffect(() => {
    const query = requirementSearch.trim();

    if (query.length < 2 || !onRequirementSearch) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      onRequirementSearch(query);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [onRequirementSearch, requirementSearch]);

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
      if (commitSearch !== '') {
        onCommitSearchClear?.();
      }
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      onCommitSearch(query);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [commitSearch, onCommitSearch, onCommitSearchClear]);

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

  function handleSelectRequirement(requirement) {
    onSelectRequirement?.(requirement);
    setRequirementSearch('');
  }

  function handleSelectCommit(commit) {
    onSelectCommit?.(commit);
    setCommitSearch('');
    onCommitSearchClear?.();
  }

  function handleCommitSearchClear() {
    setCommitSearch('');
    onCommitSearchClear?.();
    commitSearchInputRef.current?.focus();
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
          name="responsibleUserId"
          value={formData.responsibleUserId}
          onChange={handleChange}
          disabled={!hasMembers}
        >
          <option value="">
            {hasMembers ? 'Selecione um responsável' : 'Nenhum membro cadastrado'}
          </option>
          {activeMembers.map((member) => (
            <option key={member.id} value={memberUserId(member)}>
              {formatMemberName(member)}
            </option>
          ))}
        </select>
        {hasLegacyResponsible && (
          <small className="field-help">
            Responsável legado: {formData.responsible}. Selecione um usuário ativo para reconciliar.
          </small>
        )}
        {!hasMembers && (
          <small className="field-help">
            Cadastre membros no projeto para atribuir responsáveis às tarefas.
          </small>
        )}
      </label>

      <label className="field">
        <span>Prazo</span>
        <input type="date" name="deadline" value={formData.deadline} onChange={handleChange} />
      </label>

      {/* Sprint encerrada não recebe tarefa (ADR-010 D04) e o backend recusa com
          409 — só aparece na lista se já for a sprint atual da tarefa, senão a
          edição de uma tarefa antiga abriria o campo vazio e a devolveria ao
          backlog sem ninguém ter pedido. */}
      <label className="field">
        <span>Sprint</span>
        <select name="sprintId" value={formData.sprintId} onChange={handleChange}>
          <option value="">Sem sprint (backlog)</option>
          {sprints
            .filter(
              (sprint) =>
                !['CONCLUIDA', 'CANCELADA'].includes(sprint.status) ||
                String(sprint.id) === String(formData.sprintId)
            )
            .map((sprint) => (
              <option key={sprint.id} value={String(sprint.id)}>
                {sprint.name}
              </option>
            ))}
        </select>
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
          <p className="field-help">Vincule a tarefa aos artefatos importados do GitHub.</p>
        </div>

        <div className="traceability-picker">
          <span>Requisito vinculado</span>
          {formData.requirementId ? (
            <div className="traceability-selected-item">
              <strong>{formatRequirementLabel(selectedRequirement)}</strong>
              <button
                className="traceability-remove-button"
                type="button"
                onClick={() => {
                  onClearRequirement?.();
                  setRequirementSearch('');
                }}
                aria-label="Remover requisito vinculado"
                title="Remover requisito"
              >
                ×
              </button>
            </div>
          ) : null}
          <input
            type="search"
            value={requirementSearch}
            onChange={(event) => setRequirementSearch(event.target.value)}
            placeholder="Pesquisar requisito por título..."
          />
          {requirementSearch.trim().length >= 2 ? (
            <div className="traceability-results">
              {availableRequirements.length === 0 ? (
                <p>Nenhum requisito encontrado.</p>
              ) : (
                availableRequirements.map((requirement) => (
                  <button
                    key={requirement.id}
                    type="button"
                    onClick={() => handleSelectRequirement(requirement)}
                  >
                    {formatRequirementLabel(requirement)}
                  </button>
                ))
              )}
            </div>
          ) : null}
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
          <span>Buscar commits do projeto</span>
          <div className="traceability-search-field">
            <input
              ref={commitSearchInputRef}
              type="search"
              value={commitSearch}
              onChange={(event) => setCommitSearch(event.target.value)}
              placeholder="Pesquisar por SHA ou mensagem..."
              aria-label="Buscar commits do projeto"
            />
            {commitSearch && (
              <button
                className="traceability-search-clear"
                type="button"
                onClick={handleCommitSearchClear}
                aria-label="Limpar busca de commits"
                title="Limpar busca"
              >
                ×
              </button>
            )}
          </div>
          {commitSearch.trim().length >= 2 && (
            <div className="traceability-results">
              {availableCommitResults.length === 0 ? (
                <p>Nenhum commit encontrado.</p>
              ) : (
                availableCommitResults.map((commit) => (
                  <button key={commit.id} type="button" onClick={() => handleSelectCommit(commit)}>
                    {formatCommitLabel(commit)}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <CommitSuggestionsCard
          projectId={projectId}
          taskId={taskId}
          onConfirmed={onSuggestionConfirmed}
        />

        <div className="traceability-picker">
          <span>Commits vinculados</span>
          {selectedCommits.length === 0 ? (
            <p className="field-help">Nenhum commit vinculado.</p>
          ) : (
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
                  <button key={issue.id} type="button" onClick={() => handleSelectIssue(issue)}>
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
          {submitting ? 'Salvando...' : editing ? 'Salvar alterações' : 'Cadastrar tarefa'}
        </button>
      </div>
    </form>
  );
}
