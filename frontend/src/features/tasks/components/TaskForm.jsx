import { ResponsibleCombobox, SearchCombobox, SelectControl } from '../../../shared/index.js';
import { CommitSuggestionsCard } from './CommitSuggestionsCard.jsx';
import '../../../shared/styles/traceability-controls.css';
import './TaskForm.css';

export const emptyTaskForm = {
  title: '',
  description: '',
  priority: 'MEDIA',
  responsible: '',
  responsibleUserId: '',
  deadline: '',
  estimatedEffort: '',
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

// O esforço realizado é derivado das sessões de tempo (S1-06) e nunca viaja no payload.
export function taskFormToPayload(formData) {
  const payload = {
    ...formData,
    deadline: formData.deadline || null,
    estimatedEffort: normalizeNumberField(formData.estimatedEffort)
  };

  delete payload.actualEffort;
  delete payload.pullRequestId;
  delete payload.requirementId;
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
  composition = 'full',
  requirementControl,
  submitLabel,
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
  const activeMembers = projectMembers.filter(
    (member) => member.isActive !== false && member.user?.isActive !== false
  );
  const hasMembers = activeMembers.length > 0;
  const normalizedResponsible = normalizeText(formData.responsible);
  const hasLegacyResponsible = normalizedResponsible && !formData.responsibleUserId;
  const linkedCommitIds = new Set((formData.commitIds || []).map(String));
  const linkedIssueIds = new Set((formData.issueIds || []).map(String));

  async function searchWithFallback(remoteSearch, query, signal, fallback) {
    const remote = await remoteSearch?.(query, signal);
    return Array.isArray(remote) ? remote : fallback(query);
  }

  const searchRequirements = async (query, signal) =>
    (
      await searchWithFallback(onRequirementSearch, query, signal, (value) => {
        const normalized = normalizeText(value).toLowerCase();
        return requirements.filter((requirement) =>
          [requirement.title, requirement.type, requirement.status].some((field) =>
            field?.toLowerCase().includes(normalized)
          )
        );
      })
    ).filter((requirement) => String(requirement.id) !== String(formData.requirementId));
  const searchPullRequests = async (query, signal) =>
    (
      await searchWithFallback(onPullRequestSearch, query, signal, (value) => {
        const normalized = normalizeText(value).toLowerCase();
        const numeric = normalized.replace(/\D/g, '');
        return pullRequests.filter(
          (pullRequest) =>
            (numeric && Number(pullRequest.number) === Number(numeric)) ||
            pullRequest.title?.toLowerCase().includes(normalized)
        );
      })
    ).filter((pullRequest) => String(pullRequest.id) !== String(formData.pullRequestId));
  const searchCommits = async (query, signal) => {
    const found = await searchWithFallback(onCommitSearch, query, signal, (value) => {
      const normalized = normalizeText(value).toLowerCase();
      return commitResults.filter(
        (commit) =>
          commit.hash?.toLowerCase().includes(normalized) ||
          commit.shortHash?.toLowerCase().includes(normalized) ||
          commit.message?.toLowerCase().includes(normalized)
      );
    });
    const seen = new Set();
    return found
      .filter((commit) => {
        const idKey = `id:${commit.id}`;
        const hashKey = commit.hash ? `hash:${commit.hash.toLowerCase()}` : null;
        if (
          linkedCommitIds.has(String(commit.id)) ||
          seen.has(idKey) ||
          (hashKey && seen.has(hashKey))
        )
          return false;
        seen.add(idKey);
        if (hashKey) seen.add(hashKey);
        return true;
      })
      .slice(0, 20);
  };
  const searchIssues = async (query, signal) =>
    (
      await searchWithFallback(onIssueSearch, query, signal, (value) => {
        const normalized = normalizeText(value).toLowerCase();
        const numeric = normalized.replace(/\D/g, '');
        return issueResults.filter(
          (issue) =>
            (numeric && Number(issue.number) === Number(numeric)) ||
            issue.title?.toLowerCase().includes(normalized)
        );
      })
    ).filter((issue) => !linkedIssueIds.has(String(issue.id)));

  function handleChange(event) {
    onChange(event.target.name, event.target.value);
  }

  return (
    <form className="task-form" onSubmit={onSubmit}>
      <section className="task-form-section field-full" aria-labelledby="task-form-info-title">
        <header>
          <h3 id="task-form-info-title">Informações</h3>
          <p>Defina a atividade e a prioridade para o projeto.</p>
        </header>
        <div className="task-form-section__grid">
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
            <SelectControl name="priority" value={formData.priority} onChange={handleChange}>
              <option value="BAIXA">Baixa</option>
              <option value="MEDIA">Média</option>
              <option value="ALTA">Alta</option>
              <option value="CRITICA">Crítica</option>
            </SelectControl>
          </label>
        </div>
      </section>

      <section className="task-form-section field-full" aria-labelledby="task-form-plan-title">
        <header>
          <h3 id="task-form-plan-title">Planejamento</h3>
          <p>Organize responsável, prazo, Sprint e estimativa.</p>
        </header>
        <div className="task-form-section__grid">
          <ResponsibleCombobox
            members={activeMembers}
            value={formData.responsibleUserId}
            onChange={(value) => onChange('responsibleUserId', value)}
            disabled={!hasMembers || submitting}
            help={
              hasLegacyResponsible
                ? `Responsável legado: ${formData.responsible}. Selecione um responsável para reconciliar.`
                : !hasMembers
                  ? 'Cadastre membros no projeto para atribuir responsáveis às tarefas.'
                  : undefined
            }
          />

          <label className="field">
            <span>Prazo</span>
            <input type="date" name="deadline" value={formData.deadline} onChange={handleChange} />
          </label>

          {/* Sprint encerrada não recebe tarefa (ADR-010 D04) e o backend recusa com
              409 — só aparece na lista se já for a sprint atual da tarefa, senão a
              edição de uma tarefa antiga abriria o campo vazio e a devolveria ao
              backlog sem ninguém ter pedido. */}
          {composition !== 'correction' && (
            <SearchCombobox
              label="Sprint"
              placeholder="Pesquisar sprint..."
              minQueryLength={0}
              openOnFocus={false}
              options={sprints.filter(
                (sprint) => !['CONCLUIDA', 'CANCELADA'].includes(sprint.status)
              )}
              selectedOption={
                sprints.find((sprint) => String(sprint.id) === String(formData.sprintId)) || null
              }
              onSelect={(sprint) => onChange('sprintId', String(sprint.id))}
              onClear={() => onChange('sprintId', '')}
              help="Sem sprint, a tarefa permanece no backlog."
              disabled={submitting}
            />
          )}

          <label className="field">
            <span>Esforço estimado (horas)</span>
            <input
              type="number"
              min="0"
              step="0.5"
              name="estimatedEffort"
              value={formData.estimatedEffort}
              onChange={handleChange}
              placeholder="Horas"
            />
          </label>

          {editing && (
            <div className="field">
              <span>Esforço realizado</span>
              <p className="field-help">
                Calculado pelo cronômetro e pelos lançamentos manuais na tela de detalhes da tarefa.
              </p>
            </div>
          )}
        </div>
      </section>

      {composition === 'correction' ? (
        <section className="field-full">{requirementControl}</section>
      ) : (
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
                  onClick={onClearRequirement}
                  aria-label="Remover requisito vinculado"
                  title="Remover requisito"
                >
                  ×
                </button>
              </div>
            ) : null}
            <SearchCombobox
              label="Pesquisar requisito"
              placeholder="Pesquisar requisito por título..."
              onSearch={searchRequirements}
              searchErrorMessage="Não foi possível carregar os requisitos."
              onSelect={onSelectRequirement}
              getOptionLabel={formatRequirementLabel}
              disabled={submitting}
            />
          </div>

          <div className="traceability-picker">
            <span>Pull request vinculado</span>
            {formData.pullRequestId ? (
              <div className="traceability-selected-item">
                <strong>{formatPullRequestLabel(selectedPullRequest)}</strong>
                <button
                  className="traceability-remove-button"
                  type="button"
                  onClick={onClearPullRequest}
                  aria-label="Remover pull request vinculado"
                  title="Remover pull request"
                >
                  ×
                </button>
              </div>
            ) : null}
            <SearchCombobox
              label="Pesquisar pull request"
              placeholder="Pesquisar por número ou título do PR..."
              onSearch={searchPullRequests}
              searchErrorMessage="Não foi possível carregar os pull requests do projeto."
              onSelect={onSelectPullRequest}
              getOptionLabel={formatPullRequestLabel}
              isQueryValid={(query) => query.length >= 2 || /\d/.test(query)}
              disabled={submitting}
            />
          </div>

          <div className="traceability-picker">
            <SearchCombobox
              label="Buscar commits do projeto"
              placeholder="Pesquisar por SHA ou mensagem..."
              onSearch={searchCommits}
              searchErrorMessage="Não foi possível carregar os commits do projeto."
              onSelect={(commit) => {
                onSelectCommit?.(commit);
                onCommitSearchClear?.();
              }}
              getOptionLabel={formatCommitLabel}
              queryClearLabel="Limpar busca de commits"
              onQueryClear={onCommitSearchClear}
              disabled={submitting}
            />
          </div>

          <CommitSuggestionsCard
            projectId={projectId}
            taskId={taskId}
            disabled={submitting}
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
            <SearchCombobox
              label="Pesquisar issues"
              placeholder="Pesquisar issue por número ou título..."
              onSearch={searchIssues}
              searchErrorMessage="Não foi possível carregar as issues do projeto."
              onSelect={onSelectIssue}
              getOptionLabel={formatIssueLabel}
              isQueryValid={(query) => query.length >= 2 || /\d/.test(query)}
              disabled={submitting}
            />
          </div>
        </section>
      )}

      <footer className="form-actions field-full">
        {(editing || composition === 'correction') && (
          <button className="button button-secondary" type="button" onClick={onCancel}>
            {composition === 'correction' ? 'Cancelar' : 'Cancelar edição'}
          </button>
        )}
        <button className="button button-primary" type="submit" disabled={submitting}>
          {submitting
            ? 'Salvando...'
            : submitLabel || (editing ? 'Salvar alterações' : 'Cadastrar tarefa')}
        </button>
      </footer>
    </form>
  );
}
