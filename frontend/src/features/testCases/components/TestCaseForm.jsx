import { useEffect, useRef, useState } from 'react';
import { SearchCombobox, TraceFlowIcon } from '../../../shared/index.js';
import {
  validateForm,
  definitionPayload,
  LIMITS,
  requirementLabel,
  taskLabel
} from '../model/test-cases.js';
import { Field, SelectControl } from './Parts.jsx';

export function TestCaseForm({
  testCase,
  initialContext,
  members,
  searchRequirements,
  searchTasks,
  onSave,
  onCancel,
  busy,
  blocked,
  serverErrors
}) {
  const [form, setForm] = useState(() => ({
    title: testCase?.title || '',
    description: testCase?.description || '',
    status: testCase?.status || 'ATIVO',
    responsibleUserId: testCase?.responsibleUserId || '',
    requirementId: testCase?.requirementId || initialContext?.requirement?.id || '',
    taskIds: (testCase?.tasks || initialContext?.tasks || []).map((task) => task.id),
    preconditions: testCase?.preconditions || '',
    expectedResult: testCase?.expectedResult || '',
    steps: testCase?.steps.map((step) => ({ ...step, id: crypto.randomUUID() })) || [
      { id: 'new-step-0', action: '', expectedResult: '' }
    ]
  }));
  const [requirement, setRequirement] = useState(
    testCase?.requirement || initialContext?.requirement || null
  );
  const [tasks, setTasks] = useState(testCase?.tasks || initialContext?.tasks || []);
  const [errors, setErrors] = useState({});
  const formRef = useRef(null);
  const stepsRef = useRef(form.steps);
  stepsRef.current = form.steps;
  useEffect(() => {
    if (!serverErrors || !Object.keys(serverErrors).length) return;
    setErrors(
      Object.fromEntries(
        Object.entries(serverErrors).map(([key, message]) => {
          const step = /^steps\.(\d+)\.(action|expectedResult)$/.exec(key);
          return [
            step && stepsRef.current[Number(step[1])]
              ? `${stepsRef.current[Number(step[1])].id}-${step[2]}`
              : key,
            message
          ];
        })
      )
    );
    queueMicrotask(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());
  }, [serverErrors]);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const props = (key) => ({
    id: `tc-${key}`,
    value: form[key],
    maxLength: LIMITS[key],
    'aria-invalid': Boolean(errors[key]),
    'aria-describedby': errors[key] ? `tc-${key}-error` : undefined,
    onChange: (e) => update(key, e.target.value)
  });
  const stepProps = (step, key) => ({
    id: `tc-${step.id}-${key}`,
    value: step[key],
    maxLength: key === 'action' ? LIMITS.action : LIMITS.stepExpectedResult,
    'aria-invalid': Boolean(errors[`${step.id}-${key}`]),
    'aria-describedby': errors[`${step.id}-${key}`] ? `tc-${step.id}-${key}-error` : undefined,
    onChange: (e) =>
      update(
        'steps',
        form.steps.map((item) => (item.id === step.id ? { ...item, [key]: e.target.value } : item))
      )
  });
  return (
    <form
      className="tc-form tc-stack"
      ref={formRef}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const found = validateForm(form);
        if (
          !members.some(
            (member) => member.isActive && member.user.id === Number(form.responsibleUserId)
          )
        )
          found.responsibleUserId = 'Selecione um membro ativo.';
        setErrors(found);
        if (Object.keys(found).length)
          queueMicrotask(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());
        else if (!busy && !blocked) onSave(definitionPayload(form, testCase?.currentVersion));
      }}
    >
      <fieldset className="tc-form-controls tc-stack" disabled={busy}>
        <Field id="tc-title" label="Título *" error={errors.title}>
          <input autoFocus={Boolean(initialContext)} required {...props('title')} />
        </Field>
        <Field id="tc-description" label="Descrição" error={errors.description}>
          <textarea {...props('description')} />
        </Field>
        <div className="tc-columns">
          <Field id="tc-status" label="Status *" error={errors.status}>
            <SelectControl required {...props('status')}>
              <option value="ATIVO">Ativo</option>
              <option value="INATIVO">Inativo</option>
            </SelectControl>
          </Field>
          <Field id="tc-responsibleUserId" label="Responsável *" error={errors.responsibleUserId}>
            <SelectControl required {...props('responsibleUserId')}>
              <option value="">Selecione um membro ativo</option>
              {testCase &&
                !members.some(
                  (member) => member.isActive && member.user.id === testCase.responsibleUserId
                ) && (
                  <option disabled value={testCase.responsibleUserId}>
                    {testCase.responsible.name} (inativo)
                  </option>
                )}
              {members
                .filter((member) => member.isActive)
                .map((member) => (
                  <option key={member.id} value={member.user.id}>
                    {member.user.name}
                  </option>
                ))}
            </SelectControl>
          </Field>
        </div>
        <fieldset className="sprint-task-selector tc-traceability-selector">
          <legend>Rastreabilidade</legend>
          <p className="field-help">
            Vincule o caso de teste a pelo menos um requisito ou uma tarefa.
          </p>
          {testCase && !testCase.requirementId && !testCase.tasks.length && (
            <p className="tc-notice" role="status">
              Este caso não atende à regra atual de rastreabilidade. Vincule um requisito ou uma
              tarefa para salvar alterações.
            </p>
          )}
          <SearchCombobox
            error={errors.traceability}
            openOnFocus={false}
            id="tc-requirement"
            label="Requisito verificado"
            placeholder="Pesquisar requisito..."
            onSearch={searchRequirements}
            getOptionLabel={requirementLabel}
            disabled={busy}
            onSelect={(item) => {
              setRequirement(item);
              update('requirementId', item.id);
            }}
          />
          <div className="sprint-task-selector__selected">
            <strong className="sprint-task-selector__heading">Requisito selecionado</strong>
            {form.requirementId ? (
              <ul className="sprint-task-selector__list">
                <li>
                  <div>
                    <strong>{requirement && requirementLabel(requirement)}</strong>
                  </div>
                  <button
                    type="button"
                    className="button button-secondary tc-icon-button"
                    aria-label={`Remover requisito ${form.requirementId}`}
                    onClick={() => update('requirementId', '')}
                  >
                    <TraceFlowIcon name="close" />
                  </button>
                </li>
              </ul>
            ) : (
              <p className="sprint-task-selector__empty">Nenhum requisito selecionado.</p>
            )}
          </div>
          <h3 className="tc-selector-subheading">Tarefas relacionadas</h3>
          <SearchCombobox
            id="tc-tasks"
            label="Pesquisar tarefas"
            placeholder="Pesquisar tarefas..."
            onSearch={searchTasks}
            getOptionLabel={taskLabel}
            isOptionDisabled={(task) => form.taskIds.includes(task.id)}
            disabled={busy || form.taskIds.length >= LIMITS.tasks}
            onSelect={(task) => {
              setTasks((old) => [...old.filter((item) => item.id !== task.id), task]);
              update('taskIds', [...form.taskIds, task.id]);
            }}
          />
          <div className="sprint-task-selector__selected">
            <div className="sprint-task-selector__heading">
              <strong>Tarefas selecionadas ({form.taskIds.length})</strong>
            </div>
            {!form.taskIds.length && (
              <p className="sprint-task-selector__empty">Nenhuma tarefa selecionada.</p>
            )}
            <ul className="sprint-task-selector__list">
              {form.taskIds.map((id) => (
                <li key={id}>
                  <div>
                    <strong>{taskLabel(tasks.find((task) => task.id === id))}</strong>
                  </div>
                  <button
                    type="button"
                    className="button button-secondary tc-icon-button"
                    aria-label={`Remover ${id}`}
                    onClick={() =>
                      update(
                        'taskIds',
                        form.taskIds.filter((item) => item !== id)
                      )
                    }
                  >
                    <TraceFlowIcon name="close" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </fieldset>
        <Field id="tc-preconditions" label="Pré-condições *" error={errors.preconditions}>
          <textarea required {...props('preconditions')} />
        </Field>
        <section className="tc-section">
          <h3>Passos do teste</h3>
          {errors.steps && (
            <p role="alert" className="field-error">
              {errors.steps}
            </p>
          )}
          <div className="tc-step-grid">
            {form.steps.map((step, i) => (
              <div
                className="tc-step-editor"
                role="group"
                aria-labelledby={`tc-${step.id}-heading`}
                key={step.id}
              >
                <header className="tc-step-heading">
                  <h4 id={`tc-${step.id}-heading`}>Passo {i + 1}</h4>
                  <button
                    type="button"
                    className="button button-secondary tc-icon-button"
                    aria-label={`Remover passo ${i + 1}`}
                    onClick={() =>
                      update(
                        'steps',
                        form.steps.filter((item) => item.id !== step.id)
                      )
                    }
                  >
                    <TraceFlowIcon name="close" />
                  </button>
                </header>
                <Field
                  id={`tc-${step.id}-action`}
                  label={`Ação — passo ${i + 1} *`}
                  error={errors[`${step.id}-action`]}
                >
                  <textarea rows={2} required {...stepProps(step, 'action')} />
                </Field>
                <Field
                  id={`tc-${step.id}-expectedResult`}
                  label={`Resultado esperado — passo ${i + 1} *`}
                  error={errors[`${step.id}-expectedResult`]}
                >
                  <textarea rows={2} required {...stepProps(step, 'expectedResult')} />
                </Field>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="tc-add-control"
            disabled={form.steps.length >= LIMITS.steps}
            aria-invalid={Boolean(errors.steps)}
            onClick={() =>
              update('steps', [
                ...form.steps,
                { id: crypto.randomUUID(), action: '', expectedResult: '' }
              ])
            }
          >
            <span className="tc-add-control__icon">
              <TraceFlowIcon name="plus" />
            </span>
            Adicionar passo
          </button>
        </section>
        <Field
          id="tc-expectedResult"
          label="Resultado esperado do caso *"
          error={errors.expectedResult}
        >
          <textarea required {...props('expectedResult')} />
        </Field>
        {testCase && (
          <p className="field-help">
            Versão atual: v{testCase.currentVersion}. Alterações na definição podem gerar uma nova
            versão do caso.
          </p>
        )}
        <footer className="tc-footer">
          <button type="button" className="button button-secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" className="button button-primary" disabled={busy || blocked}>
            {testCase ? 'Salvar alterações' : 'Criar caso'}
          </button>
        </footer>
      </fieldset>
    </form>
  );
}
