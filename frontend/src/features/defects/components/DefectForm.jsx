import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SearchCombobox,
  ErrorState,
  LoadingState,
  normalizeApiError
} from '../../../shared/index.js';
import { useTestCaseScope } from '../../testCases/index.js';
import { defectsApi } from '../api/defects.api.js';
import {
  defectPayload,
  validateDefect,
  severities,
  statuses,
  taskLabel,
  requirementLabel,
  dateLabel
} from '../model/defects.js';
export function DefectForm({
  projectId,
  defect,
  initialExecutionId,
  initialStepId,
  options,
  busy,
  blocked,
  onSave,
  onCancel,
  onOpenDefect
}) {
  const scope = useTestCaseScope(`${projectId}:${defect?.id || initialStepId || 'new'}`),
    ref = useRef(null);
  const [candidate, setCandidate] = useState(defect?.detection || null),
    [execution, setExecution] = useState(null),
    [choices, setChoices] = useState(null),
    [loading, setLoading] = useState(false),
    [loadError, setLoadError] = useState(null),
    [changing, setChanging] = useState(false),
    [errors, setErrors] = useState({});
  const [form, setForm] = useState({
    title: defect?.title || '',
    description: defect?.description || '',
    severity: defect?.severity || '',
    responsibleUserId: defect?.responsibleUserId || '',
    requirementId: defect?.requirementId || null,
    originTaskIds: defect?.originTasks.map((t) => t.id) || []
  });
  const [requirement, setRequirement] = useState(defect?.requirement || null),
    [origins, setOrigins] = useState(defect?.originTasks || []);
  const update = (key, value) => setForm((old) => ({ ...old, [key]: value }));
  const selectCandidate = useCallback((item) => {
    setCandidate(item);
    setRequirement(item.suggestedRequirement);
    setOrigins(item.suggestedOriginTasks);
    setForm((old) => ({
      ...old,
      requirementId: item.suggestedRequirement?.id || null,
      originTaskIds: item.suggestedOriginTasks.map((t) => t.id)
    }));
  }, []);
  const loadExecution = useCallback(
    async (item, stepId) => {
      const t = scope.begin('candidates');
      setLoading(true);
      setLoadError(null);
      setExecution(item);
      try {
        const d = await defectsApi.candidates(
          projectId,
          { search: `EXEC-${item.id}`, page: 1, limit: 100 },
          { signal: t.controller.signal }
        );
        if (!scope.accepts('candidates', t)) return;
        setChoices(d.items);
        const chosen = stepId
          ? d.items.find((c) => c.detectedExecutionStepId === stepId)
          : d.items.length === 1
            ? d.items[0]
            : null;
        if (chosen) selectCandidate(chosen);
        else if (stepId)
          setLoadError({ message: 'A falha selecionada não está disponível neste projeto.' });
      } catch (e) {
        if (scope.accepts('candidates', t)) setLoadError(normalizeApiError(e));
      } finally {
        if (scope.accepts('candidates', t)) setLoading(false);
      }
    },
    [projectId, scope, selectCandidate]
  );
  useEffect(() => {
    if (initialExecutionId) void loadExecution({ id: initialExecutionId }, initialStepId);
  }, [initialExecutionId, initialStepId, loadExecution]);
  const search = useCallback(
    async (search, signal) => {
      const d = await defectsApi.candidates(projectId, { search, page: 1, limit: 50 }, { signal });
      return [
        ...new Map(d.items.map((c) => [c.execution.id, { id: c.execution.id, ...c }])).values()
      ];
    },
    [projectId]
  );
  const memberOptions = options.members
    .filter((m) => m.isActive)
    .map((m) => ({ id: m.user.id, name: m.user.name }));
  const controls = (key) => ({
    id: `defect-${key}`,
    'aria-label': { title: 'Título *', description: 'Descrição *', severity: 'Severidade *' }[key],
    value: form[key],
    onChange: (e) => update(key, e.target.value),
    'aria-invalid': Boolean(errors[key]),
    'aria-describedby': errors[key] ? `defect-${key}-error` : undefined
  });
  return (
    <form
      ref={ref}
      className="tc-stack tc-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const found = validateDefect(form);
        if (!candidate) found.detection = 'Selecione uma falha comprovada.';
        setErrors(found);
        if (Object.keys(found).length) {
          queueMicrotask(() => ref.current?.querySelector('[aria-invalid="true"]')?.focus());
          return;
        }
        if (!busy && !blocked) onSave(defectPayload(form, defect, candidate));
      }}
    >
      <fieldset disabled={busy} className="tc-stack tc-form-controls">
        <section className="tc-surface">
          <h3>Origem da falha</h3>
          {!candidate && !initialExecutionId && (
            <SearchCombobox
              label="Execução com falha *"
              placeholder="Pesquisar EXEC-id, TC-id ou título..."
              minQueryLength={0}
              openOnFocus={false}
              popoverPlacement="fixed"
              onSearch={search}
              getOptionLabel={(c) =>
                `${c.execution.displayId} · ${c.testCase.displayId} · ${c.testCase.title}`
              }
              selectedOption={execution?.execution ? execution : null}
              onSelect={(item) => loadExecution(item)}
              onClear={() => {
                scope.cancelRead('candidates');
                setExecution(null);
                setChoices(null);
              }}
              error={errors.detection}
              emptyMessage="Nenhuma falha de teste disponível. Execute um caso de teste e registre uma falha antes de criar um defeito."
              renderOption={(c) => (
                <span className="tc-candidate">
                  <strong>
                    {c.execution.displayId} · {c.testCase.displayId} · {c.testCase.title}
                  </strong>
                  <small>
                    Falhou · {c.execution.environment} · {dateLabel(c.execution.executedAt)}
                  </small>
                </span>
              )}
            />
          )}
          {loading && <LoadingState message="Carregando falhas da execução…" />}
          {loadError && (
            <ErrorState
              message={loadError.message}
              onRetry={() => loadExecution(execution, initialStepId)}
            />
          )}
          {!candidate && choices && !loading && (
            <fieldset className="defect-step-choices">
              <legend>Falha identificada *</legend>
              {!choices.length && (
                <p role="status">
                  Nenhuma falha de teste disponível. Execute um caso de teste e registre uma falha
                  antes de criar um defeito.
                </p>
              )}
              {choices.map((c) => (
                <label className="tc-surface" key={c.detectedExecutionStepId}>
                  <input type="radio" name="failedStep" onChange={() => selectCandidate(c)} />
                  <strong>Passo {c.failedStep.position}</strong>
                  <span>Ação: {c.failedStep.action}</span>
                  <span>Esperado: {c.failedStep.expectedResult}</span>
                  <span>Observado: {c.failedStep.observedResult}</span>
                </label>
              ))}
            </fieldset>
          )}
          {candidate && (
            <>
              <p>
                <strong>
                  {candidate.execution.displayId} · {candidate.testCase.displayId} · Passo{' '}
                  {candidate.failedStep.position}
                </strong>
              </p>
              <p>
                {candidate.testCase.title} · Caso v{candidate.testCase.version}
              </p>
              <p className="tc-preformatted">{candidate.failedStep.observedResult}</p>
              {!!candidate.existingDefects?.length && (
                <section>
                  <h4>Defeitos já registrados nesta falha</h4>
                  {candidate.existingDefects.map((d) => (
                    <p key={d.id}>
                      <button
                        type="button"
                        className="button button-outline button-compact"
                        onClick={() => onOpenDefect?.(d.id)}
                      >
                        DEF-{d.id} · {d.title}
                      </button>{' '}
                      · {severities[d.severity]} · {statuses[d.status]}
                    </p>
                  ))}
                  <p className="field-help">Você pode registrar outro defeito nesta falha.</p>
                </section>
              )}
              {!defect && !initialExecutionId && !changing && (
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setChanging(true)}
                >
                  Alterar falha selecionada
                </button>
              )}
              {changing && (
                <div className="tc-notice">
                  <p>
                    Alterar a falha substituirá os vínculos herdados. Os demais campos serão
                    preservados.
                  </p>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setChanging(false)}
                  >
                    Manter falha
                  </button>
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => {
                      scope.cancelRead('candidates');
                      setCandidate(null);
                      setExecution(null);
                      setChoices(null);
                      setRequirement(null);
                      setOrigins([]);
                      setForm((old) => ({ ...old, requirementId: null, originTaskIds: [] }));
                      setChanging(false);
                    }}
                  >
                    Alterar falha
                  </button>
                </div>
              )}
            </>
          )}
        </section>
        {candidate && (
          <>
            {['title', 'description'].map((key) => (
              <label className="field" key={key}>
                <span>{key === 'title' ? 'Título *' : 'Descrição *'}</span>
                {key === 'title' ? (
                  <input {...controls(key)} maxLength={200} required />
                ) : (
                  <textarea {...controls(key)} maxLength={10000} required />
                )}
                {errors[key] && (
                  <small id={`defect-${key}-error`} className="field-error">
                    {errors[key]}
                  </small>
                )}
              </label>
            ))}
            <div className="tc-columns">
              <label className="field">
                <span>Severidade *</span>
                <select {...controls('severity')} required>
                  <option value="">Selecione</option>
                  {Object.entries(severities).map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
                {errors.severity && (
                  <small className="field-error" id="defect-severity-error">
                    {errors.severity}
                  </small>
                )}
              </label>
              <SearchCombobox
                label="Responsável *"
                options={memberOptions}
                minQueryLength={0}
                openOnFocus={false}
                getOptionLabel={(m) => m.name}
                selectedOption={
                  memberOptions.find((m) => m.id === Number(form.responsibleUserId)) || null
                }
                onSelect={(m) => update('responsibleUserId', m.id)}
                onClear={() => update('responsibleUserId', '')}
                required
                error={errors.responsibleUserId}
              />
            </div>
            <section className="tc-surface tc-stack">
              <h3>Rastreabilidade</h3>
              <p className="field-help">
                Vincule o defeito a pelo menos um requisito ou uma tarefa de origem.
                {!defect && ' Vínculos iniciais herdados da versão executada.'}
              </p>
              <SearchCombobox
                label="Requisito afetado"
                onSearch={options.searchRequirements}
                openOnFocus={false}
                selectedOption={requirement}
                getOptionLabel={requirementLabel}
                onSelect={(r) => {
                  setRequirement(r);
                  update('requirementId', r.id);
                }}
                onClear={() => {
                  setRequirement(null);
                  update('requirementId', null);
                }}
                error={errors.traceability}
              />
              <SearchCombobox
                label="Tarefas de origem"
                onSearch={options.searchTasks}
                openOnFocus={false}
                getOptionLabel={taskLabel}
                disabled={form.originTaskIds.length >= 100}
                isOptionDisabled={(t) =>
                  form.originTaskIds.includes(t.id) ||
                  defect?.correctionCycles.some((c) => c.tasks.some((task) => task.id === t.id))
                }
                onSelect={(t) => {
                  setOrigins((old) => [...old, t]);
                  update('originTaskIds', [...form.originTaskIds, t.id]);
                }}
              />
              <ul className="sprint-task-selector__list">
                {origins.map((t) => (
                  <li key={t.id}>
                    <strong>{taskLabel(t)}</strong>
                    <button
                      type="button"
                      className="button button-secondary"
                      aria-label={`Remover TASK-${t.id}`}
                      onClick={() => {
                        setOrigins((old) => old.filter((x) => x.id !== t.id));
                        update(
                          'originTaskIds',
                          form.originTaskIds.filter((id) => id !== t.id)
                        );
                      }}
                    >
                      Remover
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
        <footer className="tc-footer">
          <button type="button" className="button button-secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="submit"
            className="button button-primary"
            disabled={busy || blocked || !candidate}
          >
            {defect ? 'Salvar alterações' : 'Registrar defeito'}
          </button>
        </footer>
      </fieldset>
    </form>
  );
}
